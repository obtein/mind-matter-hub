import { supabase } from "@/integrations/supabase/client";
import type {
  DbService,
  Patient,
  PatientInsert,
  Appointment,
  AppointmentWithPatient,
  AppointmentInsert,
  Medication,
  MedicationWithDate,
  MedicationRecord,
  MedicationInsert,
  Notification,
  NotificationInsert,
  ReminderInsert,
  UpcomingAppointment,
} from "./db";

export class SupabaseDbService implements DbService {
  // ── Patients ──

  async getPatients(): Promise<Patient[]> {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getPatientsWithLastAppointment(): Promise<(Patient & { last_appointment: string | null })[]> {
    // Supabase doesn't support subquery joins easily, fallback to getPatients
    const patients = await this.getPatients();
    return patients.map(p => ({ ...p, last_appointment: null }));
  }

  async getPatient(id: string): Promise<Patient | null> {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async createPatient(data: PatientInsert): Promise<Patient> {
    const { data: patient, error } = await supabase
      .from("patients")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return patient;
  }

  async updatePatient(id: string, data: Partial<Omit<PatientInsert, "doctor_id">>): Promise<void> {
    const { error } = await supabase.from("patients").update(data).eq("id", id);
    if (error) throw error;
  }

  async deletePatient(id: string): Promise<void> {
    const { error } = await supabase.from("patients").delete().eq("id", id);
    if (error) throw error;
  }

  async getLastAppointmentDate(patientId: string): Promise<string | null> {
    const { data } = await supabase
      .from("appointments")
      .select("appointment_date")
      .eq("patient_id", patientId)
      .order("appointment_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.appointment_date || null;
  }

  async getPatientsForStats(): Promise<Pick<Patient, "id" | "gender" | "date_of_birth">[]> {
    const { data, error } = await supabase
      .from("patients")
      .select("id, gender, date_of_birth");
    if (error) throw error;
    return data || [];
  }

  // ── Appointments ──

  async getAppointmentsByDateRange(start: string, end: string): Promise<AppointmentWithPatient[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, patient_id, appointment_date, duration_minutes, notes, status, patients(full_name)")
      .gte("appointment_date", start)
      .lte("appointment_date", end)
      .order("appointment_date", { ascending: true });
    if (error) throw error;
    return (data || []) as AppointmentWithPatient[];
  }

  async getAppointmentsByPatient(patientId: string): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("patient_id", patientId)
      .order("appointment_date", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async createAppointment(data: AppointmentInsert): Promise<Appointment> {
    const { data: appointment, error } = await supabase
      .from("appointments")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return appointment;
  }

  async updateAppointment(id: string, data: Partial<Pick<Appointment, "notes" | "status">>): Promise<void> {
    const { error } = await supabase.from("appointments").update(data).eq("id", id);
    if (error) throw error;
  }

  async deleteAppointment(id: string): Promise<void> {
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) throw error;
  }

  async getMonthlyAppointmentDates(start: string, end: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("appointment_date")
      .gte("appointment_date", start)
      .lte("appointment_date", end);
    if (error) throw error;
    return (data || []).map((a) => a.appointment_date);
  }

  async getAppointmentsForStats(): Promise<Pick<Appointment, "id" | "appointment_date" | "status">[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, status");
    if (error) throw error;
    return data || [];
  }

  async getAppointmentsForConflictCheck(
    dayStart: string,
    dayEnd: string,
    excludeId?: string
  ): Promise<AppointmentWithPatient[]> {
    let query = supabase
      .from("appointments")
      .select("id, patient_id, appointment_date, duration_minutes, notes, status, patients(full_name)")
      .gte("appointment_date", dayStart)
      .lte("appointment_date", dayEnd)
      .neq("status", "cancelled");

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as AppointmentWithPatient[];
  }

  async getUpcomingAppointments(now: string, tomorrow: string): Promise<UpcomingAppointment[]> {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, patients:patient_id(full_name)")
      .eq("status", "scheduled")
      .gte("appointment_date", now)
      .lte("appointment_date", tomorrow)
      .order("appointment_date", { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as UpcomingAppointment[];
  }

  // ── Medications ──

  async getMedicationsByAppointment(appointmentId: string): Promise<Medication[]> {
    const { data, error } = await supabase
      .from("session_medications")
      .select("*")
      .eq("appointment_id", appointmentId)
      .order("created_at");
    if (error) throw error;
    return data || [];
  }

  async getMedicationsByAppointmentIds(ids: string[]): Promise<MedicationWithDate[]> {
    const { data, error } = await supabase
      .from("session_medications")
      .select("id, medication_name, dosage, instructions, appointments:appointment_id(appointment_date)")
      .in("appointment_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((med: any) => ({
      id: med.id,
      medication_name: med.medication_name,
      dosage: med.dosage,
      instructions: med.instructions,
      appointment_date: med.appointments?.appointment_date || "",
    }));
  }

  async getAllMedicationsWithDetails(): Promise<MedicationRecord[]> {
    const { data, error } = await supabase
      .from("session_medications")
      .select(`
        id,
        medication_name,
        dosage,
        instructions,
        created_at,
        appointments:appointment_id (
          appointment_date,
          patients:patient_id (
            id,
            full_name
          )
        )
      `)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((med: any) => ({
      id: med.id,
      medication_name: med.medication_name,
      dosage: med.dosage,
      instructions: med.instructions,
      created_at: med.created_at,
      appointment: med.appointments
        ? {
            appointment_date: med.appointments.appointment_date,
            patient: med.appointments.patients,
          }
        : null,
    }));
  }

  async createMedication(data: MedicationInsert): Promise<void> {
    const { error } = await supabase.from("session_medications").insert(data);
    if (error) throw error;
  }

  async deleteMedication(id: string): Promise<void> {
    const { error } = await supabase.from("session_medications").delete().eq("id", id);
    if (error) throw error;
  }

  // ── Notifications ──

  async getNotifications(limit = 20): Promise<Notification[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async getNotificationsByAppointmentIds(ids: string[]): Promise<{ related_appointment_id: string }[]> {
    const { data } = await supabase
      .from("notifications")
      .select("related_appointment_id")
      .in("related_appointment_id", ids);
    return (data || []) as { related_appointment_id: string }[];
  }

  async createNotification(data: NotificationInsert): Promise<void> {
    const { error } = await supabase.from("notifications").insert(data);
    if (error) throw error;
  }

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (error) throw error;
  }

  async markAllNotificationsRead(): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false);
    if (error) throw error;
  }

  async deleteNotification(id: string): Promise<void> {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) throw error;
  }

  subscribeToNotifications(callback: () => void): { unsubscribe: () => void } {
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => callback()
      )
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  }

  // ── Reminders ──

  async createReminder(data: ReminderInsert): Promise<void> {
    const { error } = await supabase.from("appointment_reminders").insert(data);
    if (error) throw error;
  }

  // ── Profiles ──

  async getProfile(): Promise<{ full_name: string } | null> {
    const { data } = await supabase.from("profiles").select("full_name").single();
    return data;
  }

  // ── Patient name lookup ──

  async getPatientName(id: string): Promise<{ id: string; full_name: string } | null> {
    const { data, error } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
