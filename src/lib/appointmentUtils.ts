import type { DbService } from "@/services/db";

interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingPatient?: string;
}

export const checkAppointmentConflict = async (
  appointmentDate: Date,
  durationMinutes: number,
  excludeAppointmentId: string | undefined,
  db: DbService
): Promise<ConflictCheckResult> => {
  const startTime = appointmentDate.getTime();
  const endTime = startTime + durationMinutes * 60 * 1000;

  // Fetch appointments for the same day
  const dayStart = new Date(appointmentDate);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(appointmentDate);
  dayEnd.setHours(23, 59, 59, 999);

  const appointments = await db.getAppointmentsForConflictCheck(
    dayStart.toISOString(),
    dayEnd.toISOString(),
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
        conflictingPatient: (apt.patients as Record<string, unknown> | undefined)?.full_name as string || "Bilinmeyen Hasta",
      };
    }
  }

  return { hasConflict: false };
};
