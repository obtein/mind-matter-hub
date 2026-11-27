import type { DbService } from "@/services/db";

interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingPatient?: string;
}

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const checkAppointmentConflict = async (
  appointmentDate: Date,
  durationMinutes: number,
  excludeAppointmentId: string | undefined,
  db: DbService
): Promise<ConflictCheckResult> => {
  const startTime = appointmentDate.getTime();
  const endTime = startTime + durationMinutes * 60 * 1000;

  // Any appointment that starts up to a day earlier can still be running (a session after
  // 23:00 crosses midnight), so the window is not the calendar day.
  const windowStart = new Date(startTime - LOOKBACK_MS);
  const windowEnd = new Date(endTime);

  const appointments = await db.getAppointmentsForConflictCheck(
    windowStart.toISOString(),
    windowEnd.toISOString(),
    excludeAppointmentId
  );

  // Check for overlapping appointments
  for (const apt of appointments || []) {
    const aptStart = new Date(apt.appointment_date).getTime();
    const aptEnd = aptStart + apt.duration_minutes * 60 * 1000;

    // Check if time ranges overlap
    if (startTime < aptEnd && endTime > aptStart) {
      return {
        hasConflict: true,
        conflictingPatient: apt.patients?.full_name ?? "Bilinmeyen Hasta",
      };
    }
  }

  return { hasConflict: false };
};
