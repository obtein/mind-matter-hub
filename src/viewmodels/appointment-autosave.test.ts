// @vitest-environment jsdom
/**
 * Regression for bug-hunt H1 (2026-11-27): the status select only changed local state and
 * session notes were saved only by the "Kaydet" button, so leaving the view lost both.
 * Measured: all 1166 appointments in the cloud were still 'scheduled'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useAppointment } from "./useAppointment";
import { flushPendingSaves } from "@/lib/pending-saves";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const APPOINTMENT = {
  id: "apt-1",
  appointment_date: "2026-10-10T07:00:00.000Z",
  duration_minutes: 60,
  notes: "saved notes",
  status: "scheduled",
  patient_id: "pat-1",
  created_at: "2026-10-01T00:00:00.000Z",
};

function makeDb() {
  return {
    getCurrentUserId: vi.fn(() => "doctor-1"),
    getAppointment: vi.fn(async () => ({ ...APPOINTMENT })),
    getPatientName: vi.fn(async () => ({ id: "pat-1", full_name: "Test Patient" })),
    getMedicationsByAppointment: vi.fn(async () => []),
    getAppointmentsForConflictCheck: vi.fn(async () => []),
    updateAppointment: vi.fn(async () => {}),
  };
}
let db: ReturnType<typeof makeDb>;

vi.mock("@/services/ServiceContext", () => ({
  useDb: () => db,
  useAuth: () => ({}),
}));

async function load() {
  const hook = renderHook(() => useAppointment("apt-1", "pat-1"));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  db = makeDb();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAppointment status", () => {
  it("saves the status as soon as it is picked", async () => {
    const { result } = await load();
    await act(async () => {
      await result.current.changeStatus("completed");
    });
    expect(db.updateAppointment).toHaveBeenCalledWith("apt-1", { status: "completed" });
    expect(result.current.status).toBe("completed");
  });

  it("reverts the select when the save fails", async () => {
    const { result } = await load();
    db.updateAppointment.mockRejectedValueOnce(new Error("disk"));
    await act(async () => {
      await result.current.changeStatus("cancelled");
    });
    expect(result.current.status).toBe("scheduled");
  });
});

describe("useAppointment notes autosave", () => {
  it("saves typed notes after a pause", async () => {
    const { result } = await load();
    vi.useFakeTimers();
    act(() => result.current.setNotes("new notes"));
    expect(db.updateAppointment).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(db.updateAppointment).toHaveBeenCalledWith("apt-1", { notes: "new notes" });
    expect(result.current.notesDirty).toBe(false);
  });

  it("saves unsaved notes when the view is left (unmount)", async () => {
    const { result, unmount } = await load();
    act(() => result.current.setNotes("typed then left"));
    unmount();
    await waitFor(() => expect(db.updateAppointment).toHaveBeenCalledWith("apt-1", { notes: "typed then left" }));
  });

  it("saves unsaved notes before the window closes (flushPendingSaves)", async () => {
    const { result } = await load();
    act(() => result.current.setNotes("typed then closed"));
    await act(async () => {
      await flushPendingSaves();
    });
    expect(db.updateAppointment).toHaveBeenCalledWith("apt-1", { notes: "typed then closed" });
  });

  it("does not save when nothing changed", async () => {
    const { unmount } = await load();
    unmount();
    await flushPendingSaves();
    expect(db.updateAppointment).not.toHaveBeenCalled();
  });
});

describe("useAppointment reactivation (bug-hunt L5)", () => {
  it("refuses to set a cancelled appointment back to scheduled over another booking", async () => {
    db.getAppointment.mockResolvedValue({ ...APPOINTMENT, status: "cancelled" });
    (db as unknown as { getAppointmentsForConflictCheck: ReturnType<typeof vi.fn> }).getAppointmentsForConflictCheck =
      vi.fn(async () => [{ appointment_date: APPOINTMENT.appointment_date, duration_minutes: 60, patients: { full_name: "Ali" } }]);
    const { result } = await load();
    await act(async () => {
      await result.current.changeStatus("scheduled");
    });
    expect(result.current.status).toBe("cancelled");
    expect(db.updateAppointment).not.toHaveBeenCalled();
  });
});
