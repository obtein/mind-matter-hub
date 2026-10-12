// @vitest-environment jsdom
/**
 * Regression checks for the live reports of 2026-10-12.
 *
 * 1. A submit that arrives while the dialog is closing (Radix keeps the content
 *    on screen for the 200 ms exit animation) must not create a second row.
 * 2. Two submits from the same render must create one row.
 * 3. Creating a row must not depend on the Supabase Auth server. The old code
 *    awaited auth.getUser(), which is a network request.
 * 4. Adding or deleting a diagnosis must not revert unsaved session notes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { useAppointment } from "./useAppointment";
import { usePatientDetail } from "./usePatientDetail";
import { usePatients } from "./usePatients";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const fakeAuth = {
  signIn: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(async () => ({ id: "doctor-1", email: "d@example.com" })),
  getSession: vi.fn(async () => ({ user: { id: "doctor-1", email: "d@example.com" } })),
  onAuthStateChange: vi.fn(() => ({ unsubscribe: () => {} })),
};

let db: FakeDb;

vi.mock("@/services/ServiceContext", () => ({
  useAuth: () => fakeAuth,
  useDb: () => db,
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

const PATIENT = {
  id: "pat-1",
  full_name: "Test Patient",
  phone: null,
  date_of_birth: null,
  gender: null,
  address: null,
  meslek: null,
  notes: null,
  doctor_id: "doctor-1",
  created_at: "2026-10-01T00:00:00.000Z",
};

function makeDb() {
  const medications: Array<Record<string, unknown>> = [];
  return {
    getCurrentUserId: vi.fn(() => "doctor-1"),
    getAppointment: vi.fn(async () => ({ ...APPOINTMENT })),
    getPatientName: vi.fn(async () => ({ id: "pat-1", full_name: "Test Patient" })),
    getPatient: vi.fn(async () => ({ ...PATIENT })),
    getAppointmentsByPatient: vi.fn(async () => []),
    getMedicationsByAppointment: vi.fn(async () =>
      medications.map((m, i) => ({ id: `med-${i}`, ...m }))
    ),
    getMedicationsByAppointmentIds: vi.fn(async () => []),
    getAppointmentsForConflictCheck: vi.fn(async () => []),
    getPatientsWithLastAppointment: vi.fn(async () => []),
    createAppointment: vi.fn(async (data: Record<string, unknown>) => ({
      id: "apt-new",
      status: "scheduled",
      created_at: "2026-10-12T00:00:00.000Z",
      ...data,
    })),
    createReminder: vi.fn(async () => {}),
    createMedication: vi.fn(async (data: Record<string, unknown>) => {
      medications.push(data);
    }),
    createPatient: vi.fn(async (data: Record<string, unknown>) => ({ id: "pat-new", ...data })),
  };
}
type FakeDb = ReturnType<typeof makeDb>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  db = makeDb();
  vi.clearAllMocks();
  fakeAuth.getUser.mockImplementation(async () => ({ id: "doctor-1", email: "d@example.com" }));
});

describe("usePatientDetail.createAppointment", () => {
  async function openAndFill() {
    const hook = renderHook(() => usePatientDetail("pat-1"));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    act(() => hook.result.current.setIsDialogOpen(true));
    act(() =>
      hook.result.current.setFormData({
        ...hook.result.current.formData,
        appointment_date: "2026-10-13",
        appointment_time: "10:00",
      })
    );
    return hook;
  }

  it("ignores a second submit that arrives while the dialog is closing", async () => {
    const { result } = await openAndFill();

    await act(async () => {
      await result.current.createAppointment();
    });
    expect(db.createAppointment).toHaveBeenCalledTimes(1);
    expect(result.current.isDialogOpen).toBe(false);

    // The dialog is still visible during its exit animation; the user clicks again.
    await act(async () => {
      await result.current.createAppointment();
    });
    expect(db.createAppointment).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("creates the appointment without asking the Auth server", async () => {
    fakeAuth.getUser.mockImplementation(async () => {
      throw new Error("Auth server unreachable");
    });
    const { result } = await openAndFill();

    await act(async () => {
      await result.current.createAppointment();
    });

    expect(fakeAuth.getUser).not.toHaveBeenCalled();
    expect(db.createAppointment).toHaveBeenCalledTimes(1);
    expect(db.createAppointment.mock.calls[0][0]).toMatchObject({
      doctor_id: "doctor-1",
      patient_id: "pat-1",
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});

describe("useAppointment.createNewAppointment", () => {
  it("ignores a second submit that arrives while the dialog is closing", async () => {
    const { result } = renderHook(() => useAppointment("apt-1", "pat-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setIsNewAppointmentDialogOpen(true));
    act(() =>
      result.current.setNewAppointmentForm({
        ...result.current.newAppointmentForm,
        appointment_date: "2026-10-13",
        appointment_time: "10:00",
      })
    );

    await act(async () => {
      await result.current.createNewAppointment();
    });
    expect(db.createAppointment).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.createNewAppointment();
    });
    expect(db.createAppointment).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(fakeAuth.getUser).not.toHaveBeenCalled();
  });
});

describe("useAppointment.addMedication", () => {
  const FORM = { medication_name: "F41.1", dosage: "", instructions: "" };

  async function load() {
    const hook = renderHook(() => useAppointment("apt-1", "pat-1"));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it("ignores submits that arrive while the dialog is closing", async () => {
    const { result } = await load();
    act(() => result.current.setIsMedicationDialogOpen(true));
    act(() => result.current.setMedicationForm(FORM));

    await act(async () => {
      await result.current.addMedication();
    });
    expect(db.createMedication).toHaveBeenCalledTimes(1);
    expect(result.current.isMedicationDialogOpen).toBe(false);

    // Second click on the fading dialog: the form is already empty.
    await act(async () => {
      await result.current.addMedication();
    });
    expect(toast.error).not.toHaveBeenCalled();

    // Second click on the fading dialog with a value still in the form.
    act(() => result.current.setMedicationForm(FORM));
    await act(async () => {
      await result.current.addMedication();
    });
    expect(db.createMedication).toHaveBeenCalledTimes(1);
  });

  it("creates one row when two submits come from the same render", async () => {
    const { result } = await load();
    const gate = deferred<void>();
    db.createMedication.mockImplementationOnce(() => gate.promise);
    act(() => result.current.setIsMedicationDialogOpen(true));
    act(() => result.current.setMedicationForm(FORM));

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.addMedication();
      second = result.current.addMedication();
    });
    gate.resolve();
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(db.createMedication).toHaveBeenCalledTimes(1);
  });

  it("keeps unsaved session notes after a diagnosis is added", async () => {
    const { result } = await load();
    expect(result.current.notes).toBe("saved notes");

    act(() => result.current.setNotes("saved notes and new typing"));
    act(() => result.current.setIsMedicationDialogOpen(true));
    act(() => result.current.setMedicationForm(FORM));
    await act(async () => {
      await result.current.addMedication();
    });
    await waitFor(() => expect(result.current.medications).toHaveLength(1));

    expect(result.current.notes).toBe("saved notes and new typing");
  });
});

describe("usePatients.submitPatient", () => {
  it("creates once, without the Auth server, and ignores a submit after the dialog closed", async () => {
    fakeAuth.getUser.mockImplementation(async () => {
      throw new Error("Auth server unreachable");
    });
    const { result } = renderHook(() => usePatients());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.openNewDialog());
    act(() =>
      result.current.setFormData({ ...result.current.formData, full_name: "Test Patient" })
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.submitPatient();
    });
    expect(ok).toBe(true);
    expect(db.createPatient).toHaveBeenCalledTimes(1);
    expect(db.createPatient.mock.calls[0][0]).toMatchObject({ doctor_id: "doctor-1" });
    expect(result.current.isDialogOpen).toBe(false);

    act(() => result.current.setFormData({ ...result.current.formData, full_name: "Again" }));
    await act(async () => {
      await result.current.submitPatient();
    });
    expect(db.createPatient).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
