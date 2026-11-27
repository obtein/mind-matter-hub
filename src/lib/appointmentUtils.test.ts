import { describe, expect, it, vi } from "vitest";
import { checkAppointmentConflict } from "./appointmentUtils";
import type { DbService } from "@/services/db";

// Regression for bug-hunt L5 (2026-11-27): the check fetched only appointments that START on
// the same local day, so an evening session running past midnight was not seen.

function dbWith(appointments: { appointment_date: string; duration_minutes: number }[]) {
  const getAppointmentsForConflictCheck = vi.fn(async (start: string, end: string, _exclude?: string) =>
    appointments
      .filter((a) => a.appointment_date >= start && a.appointment_date <= end)
      .map((a) => ({ ...a, patients: { full_name: "Ayşe" } })),
  );
  return { db: { getAppointmentsForConflictCheck } as unknown as DbService, getAppointmentsForConflictCheck };
}

describe("checkAppointmentConflict", () => {
  it("sees a session that started the evening before and runs past midnight", async () => {
    const prev = new Date(2026, 10, 27, 23, 30);
    const { db } = dbWith([{ appointment_date: prev.toISOString(), duration_minutes: 90 }]);
    const res = await checkAppointmentConflict(new Date(2026, 10, 28, 0, 30), 60, undefined, db);
    expect(res).toEqual({ hasConflict: true, conflictingPatient: "Ayşe" });
  });

  it("allows back-to-back sessions", async () => {
    const { db } = dbWith([{ appointment_date: new Date(2026, 10, 27, 9, 0).toISOString(), duration_minutes: 60 }]);
    const res = await checkAppointmentConflict(new Date(2026, 10, 27, 10, 0), 60, undefined, db);
    expect(res.hasConflict).toBe(false);
  });

  it("passes the id to exclude", async () => {
    const { db, getAppointmentsForConflictCheck } = dbWith([]);
    await checkAppointmentConflict(new Date(2026, 10, 27, 10, 0), 60, "apt-1", db);
    expect(getAppointmentsForConflictCheck.mock.calls[0][2]).toBe("apt-1");
  });
});
