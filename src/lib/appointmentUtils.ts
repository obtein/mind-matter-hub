import { supabase } from "@/integrations/supabase/client";

interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingPatient?: string;
}

export const checkAppointmentConflict = async (
  appointmentDate: Date,
  durationMinutes: number,
  excludeAppointmentId?: string
): Promise<ConflictCheckResult> => {
  const startTime = appointmentDate.getTime();
  const endTime = startTime + durationMinutes * 60 * 1000;

  // Fetch appointments for the same day
  const dayStart = new Date(appointmentDate);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(appointmentDate);
  dayEnd.setHours(23, 59, 59, 999);

  let query = supabase
    .from("appointments")
    .select("id, appointment_date, duration_minutes, patients(full_name)")
    .gte("appointment_date", dayStart.toISOString())
    .lte("appointment_date", dayEnd.toISOString())
    .neq("status", "cancelled");

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data: appointments, error } = await query;

  if (error) {
    throw error;
  }

  // Check for overlapping appointments
  for (const apt of appointments || []) {
    const aptStart = new Date(apt.appointment_date).getTime();
    const aptEnd = aptStart + apt.duration_minutes * 60 * 1000;

    // Check if time ranges overlap
    if (startTime < aptEnd && endTime > aptStart) {
      return {
        hasConflict: true,
        conflictingPatient: (apt.patients as any)?.full_name || "Bilinmeyen Hasta",
      };
    }
  }

  return { hasConflict: false };
};
