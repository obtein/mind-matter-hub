import { getPGlite } from "./pglite/init";
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

export class PGliteDbService implements DbService {
  // ── Patients ──

  async getPatients(): Promise<Patient[]> {
    const db = await getPGlite();
    const { rows } = await db.query<Patient>(
      "SELECT * FROM patients ORDER BY created_at DESC"
    );
    return rows;
  }

  async getPatientsWithLastAppointment(): Promise<(Patient & { last_appointment: string | null })[]> {
    const db = await getPGlite();
    const { rows } = await db.query<Patient & { last_appointment: string | null }>(
      `SELECT p.*, a.last_date as last_appointment
       FROM patients p
       LEFT JOIN (
         SELECT patient_id, MAX(appointment_date) as last_date
         FROM appointments
         GROUP BY patient_id
       ) a ON a.patient_id = p.id
       ORDER BY p.created_at DESC`
    );
    return rows;
  }

  async getPatient(id: string): Promise<Patient | null> {
    const db = await getPGlite();
    const { rows } = await db.query<Patient>(
      "SELECT * FROM patients WHERE id = $1",
      [id]
    );
    return rows[0] || null;
  }

  async createPatient(data: PatientInsert): Promise<Patient> {
    const db = await getPGlite();
    const { rows } = await db.query<Patient>(
      `INSERT INTO patients (doctor_id, full_name, phone, date_of_birth, gender, address, meslek, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.doctor_id, data.full_name, data.phone ?? null, data.date_of_birth ?? null, data.gender ?? null, data.address ?? null, data.meslek ?? null, data.notes ?? null]
    );
    return rows[0];
  }

  async updatePatient(id: string, data: Partial<Omit<PatientInsert, "doctor_id">>): Promise<void> {
    const db = await getPGlite();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return;

    values.push(id);
    await db.query(
      `UPDATE patients SET ${fields.join(", ")} WHERE id = $${idx}`,
      values
    );
  }

  async deletePatient(id: string): Promise<void> {
    const db = await getPGlite();
    await db.query("DELETE FROM patients WHERE id = $1", [id]);
  }

  async getLastAppointmentDate(patientId: string): Promise<string | null> {
    const db = await getPGlite();
    const { rows } = await db.query<{ appointment_date: string }>(
      "SELECT appointment_date FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC LIMIT 1",
      [patientId]
    );
    return rows[0]?.appointment_date || null;
  }

  async getPatientsForStats(): Promise<Pick<Patient, "id" | "gender" | "date_of_birth">[]> {
    const db = await getPGlite();
    const { rows } = await db.query<Pick<Patient, "id" | "gender" | "date_of_birth">>(
      "SELECT id, gender, date_of_birth FROM patients"
    );
    return rows;
  }

  // ── Appointments ──

  async getAppointmentsByDateRange(start: string, end: string): Promise<AppointmentWithPatient[]> {
    const db = await getPGlite();
    const { rows } = await db.query<AppointmentWithPatient & { patient_full_name: string | null }>(
      `SELECT a.id, a.patient_id, a.appointment_date, a.duration_minutes, a.notes, a.status,
              p.full_name as patient_full_name
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE a.appointment_date >= $1 AND a.appointment_date <= $2
       ORDER BY a.appointment_date ASC`,
      [start, end]
    );
    return rows.map((r) => ({
      id: r.id,
      patient_id: r.patient_id,
      appointment_date: r.appointment_date,
      duration_minutes: r.duration_minutes,
      notes: r.notes,
      status: r.status,
      patients: r.patient_full_name ? { full_name: r.patient_full_name } : null,
    }));
  }

  async getAppointmentsByPatient(patientId: string): Promise<Appointment[]> {
    const db = await getPGlite();
    const { rows } = await db.query<Appointment>(
      "SELECT * FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC",
      [patientId]
    );
    return rows;
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    const db = await getPGlite();
    const { rows } = await db.query<Appointment>(
      "SELECT * FROM appointments WHERE id = $1",
      [id]
    );
    return rows[0] || null;
  }

  async createAppointment(data: AppointmentInsert): Promise<Appointment> {
    const db = await getPGlite();
    const { rows } = await db.query<Appointment>(
      `INSERT INTO appointments (doctor_id, patient_id, appointment_date, duration_minutes, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.doctor_id, data.patient_id, data.appointment_date, data.duration_minutes ?? 60, data.notes ?? null]
    );
    return rows[0];
  }

  async updateAppointment(id: string, data: Partial<Pick<Appointment, "notes" | "status">>): Promise<void> {
    const db = await getPGlite();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.notes !== undefined) { fields.push(`notes = $${idx}`); values.push(data.notes); idx++; }
    if (data.status !== undefined) { fields.push(`status = $${idx}`); values.push(data.status); idx++; }
    if (fields.length === 0) return;

    values.push(id);
    await db.query(
      `UPDATE appointments SET ${fields.join(", ")} WHERE id = $${idx}`,
      values
    );
  }

  async deleteAppointment(id: string): Promise<void> {
    const db = await getPGlite();
    await db.query("DELETE FROM appointments WHERE id = $1", [id]);
  }

  async getMonthlyAppointmentDates(start: string, end: string): Promise<string[]> {
    const db = await getPGlite();
    const { rows } = await db.query<{ appointment_date: string }>(
      "SELECT appointment_date FROM appointments WHERE appointment_date >= $1 AND appointment_date <= $2",
      [start, end]
    );
    return rows.map((r) => r.appointment_date);
  }

  async getAppointmentsForStats(): Promise<Pick<Appointment, "id" | "appointment_date" | "status">[]> {
    const db = await getPGlite();
    const { rows } = await db.query<Pick<Appointment, "id" | "appointment_date" | "status">>(
      "SELECT id, appointment_date, status FROM appointments"
    );
    return rows;
  }

  async getAppointmentsForConflictCheck(
    dayStart: string,
    dayEnd: string,
    excludeId?: string
  ): Promise<AppointmentWithPatient[]> {
    const db = await getPGlite();
    let sql = `
      SELECT a.id, a.patient_id, a.appointment_date, a.duration_minutes, a.notes, a.status,
             p.full_name as patient_full_name
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      WHERE a.appointment_date >= $1 AND a.appointment_date <= $2 AND a.status != 'cancelled'
    `;
    const params: unknown[] = [dayStart, dayEnd];

    if (excludeId) {
      sql += ` AND a.id != $3`;
      params.push(excludeId);
    }

    const { rows } = await db.query<AppointmentWithPatient & { patient_full_name: string | null }>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      patient_id: r.patient_id,
      appointment_date: r.appointment_date,
      duration_minutes: r.duration_minutes,
      notes: r.notes,
      status: r.status,
      patients: r.patient_full_name ? { full_name: r.patient_full_name } : null,
    }));
  }

  async getUpcomingAppointments(now: string, tomorrow: string): Promise<UpcomingAppointment[]> {
    const db = await getPGlite();
    const { rows } = await db.query<{ id: string; appointment_date: string; patient_full_name: string | null }>(
      `SELECT a.id, a.appointment_date, p.full_name as patient_full_name
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE a.status = 'scheduled' AND a.appointment_date >= $1 AND a.appointment_date <= $2
       ORDER BY a.appointment_date ASC`,
      [now, tomorrow]
    );
    return rows.map((r) => ({
      id: r.id,
      appointment_date: r.appointment_date,
      patients: r.patient_full_name ? { full_name: r.patient_full_name } : null,
    }));
  }

  // ── Medications ──

  async getMedicationsByAppointment(appointmentId: string): Promise<Medication[]> {
    const db = await getPGlite();
    const { rows } = await db.query<Medication>(
      "SELECT * FROM session_medications WHERE appointment_id = $1 ORDER BY created_at",
      [appointmentId]
    );
    return rows;
  }

  async getMedicationsByAppointmentIds(ids: string[]): Promise<MedicationWithDate[]> {
    if (ids.length === 0) return [];
    const db = await getPGlite();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await db.query<{
      id: string;
      medication_name: string;
      dosage: string | null;
      instructions: string | null;
      appointment_date: string;
    }>(
      `SELECT sm.id, sm.medication_name, sm.dosage, sm.instructions, a.appointment_date
       FROM session_medications sm
       JOIN appointments a ON sm.appointment_id = a.id
       WHERE sm.appointment_id IN (${placeholders})
       ORDER BY sm.created_at DESC`,
      ids
    );
    return rows.map((r) => ({
      id: r.id,
      medication_name: r.medication_name,
      dosage: r.dosage,
      instructions: r.instructions,
      appointment_date: r.appointment_date || "",
    }));
  }

  async getAllMedicationsWithDetails(): Promise<MedicationRecord[]> {
    const db = await getPGlite();
    const { rows } = await db.query<{
      id: string;
      medication_name: string;
      dosage: string | null;
      instructions: string | null;
      created_at: string;
      appointment_date: string | null;
      patient_id: string | null;
      patient_full_name: string | null;
    }>(
      `SELECT sm.id, sm.medication_name, sm.dosage, sm.instructions, sm.created_at,
              a.appointment_date, p.id as patient_id, p.full_name as patient_full_name
       FROM session_medications sm
       LEFT JOIN appointments a ON sm.appointment_id = a.id
       LEFT JOIN patients p ON a.patient_id = p.id
       ORDER BY sm.created_at DESC`
    );
    return rows.map((r) => ({
      id: r.id,
      medication_name: r.medication_name,
      dosage: r.dosage,
      instructions: r.instructions,
      created_at: r.created_at,
      appointment: r.appointment_date
        ? {
            appointment_date: r.appointment_date,
            patient: r.patient_id ? { id: r.patient_id, full_name: r.patient_full_name! } : null,
          }
        : null,
    }));
  }

  async createMedication(data: MedicationInsert): Promise<void> {
    const db = await getPGlite();
    await db.query(
      `INSERT INTO session_medications (appointment_id, medication_name, dosage, instructions)
       VALUES ($1, $2, $3, $4)`,
      [data.appointment_id, data.medication_name, data.dosage ?? null, data.instructions ?? null]
    );
  }

  async deleteMedication(id: string): Promise<void> {
    const db = await getPGlite();
    await db.query("DELETE FROM session_medications WHERE id = $1", [id]);
  }

  // ── Notifications ──

  async getNotifications(limit = 20): Promise<Notification[]> {
    const db = await getPGlite();
    const { rows } = await db.query<Notification>(
      "SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return rows;
  }

  async getNotificationsByAppointmentIds(ids: string[]): Promise<{ related_appointment_id: string }[]> {
    if (ids.length === 0) return [];
    const db = await getPGlite();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await db.query<{ related_appointment_id: string }>(
      `SELECT related_appointment_id FROM notifications WHERE related_appointment_id IN (${placeholders})`,
      ids
    );
    return rows;
  }

  async createNotification(data: NotificationInsert): Promise<void> {
    const db = await getPGlite();
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, related_appointment_id, related_patient_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.user_id, data.title, data.message, data.type ?? "info", data.related_appointment_id ?? null, data.related_patient_id ?? null]
    );
  }

  async markNotificationRead(id: string): Promise<void> {
    const db = await getPGlite();
    await db.query("UPDATE notifications SET is_read = true WHERE id = $1", [id]);
  }

  async markAllNotificationsRead(): Promise<void> {
    const db = await getPGlite();
    await db.query("UPDATE notifications SET is_read = true WHERE is_read = false");
  }

  async deleteNotification(id: string): Promise<void> {
    const db = await getPGlite();
    await db.query("DELETE FROM notifications WHERE id = $1", [id]);
  }

  subscribeToNotifications(callback: () => void): { unsubscribe: () => void } {
    // PGlite has no realtime — use polling
    const interval = setInterval(callback, 10000);
    return { unsubscribe: () => clearInterval(interval) };
  }

  // ── Reminders ──

  async createReminder(data: ReminderInsert): Promise<void> {
    const db = await getPGlite();
    await db.query(
      `INSERT INTO appointment_reminders (appointment_id, reminder_type, reminder_time)
       VALUES ($1, $2, $3)`,
      [data.appointment_id, data.reminder_type, data.reminder_time]
    );
  }

  // ── Profiles ──

  async getProfile(): Promise<{ full_name: string } | null> {
    const db = await getPGlite();
    const { rows } = await db.query<{ full_name: string }>(
      "SELECT full_name FROM profiles LIMIT 1"
    );
    return rows[0] || null;
  }

  // ── Patient name lookup ──

  async getPatientName(id: string): Promise<{ id: string; full_name: string } | null> {
    const db = await getPGlite();
    const { rows } = await db.query<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM patients WHERE id = $1",
      [id]
    );
    return rows[0] || null;
  }
}
