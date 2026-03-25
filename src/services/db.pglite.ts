import { getPGlite } from "./pglite/init";
import { remoteLog } from "./remote-logger";

/** PGlite returns Date objects for timestamp columns. Ensure they are ISO strings. */
function toISOString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return String(val ?? "");
}

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
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Patient>(
        "SELECT * FROM patients ORDER BY created_at DESC"
      );
      return rows;
    } catch (error) {
      console.error("[db.getPatients] failed:", error);
      remoteLog.error("db.getPatients failed", { error: (error as Error).message });
      return [];
    }
  }

  async getPatientsWithLastAppointment(): Promise<(Patient & { last_appointment: string | null })[]> {
    try {
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
    } catch (error) {
      console.error("[db.getPatientsWithLastAppointment] failed:", error);
      remoteLog.error("db.getPatientsWithLastAppointment failed", { error: (error as Error).message });
      return [];
    }
  }

  async getPatient(id: string): Promise<Patient | null> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Patient>(
        "SELECT * FROM patients WHERE id = $1",
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("[db.getPatient] failed:", error);
      remoteLog.error("db.getPatient failed", { error: (error as Error).message });
      return null;
    }
  }

  async createPatient(data: PatientInsert): Promise<Patient> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Patient>(
        `INSERT INTO patients (doctor_id, full_name, phone, date_of_birth, gender, address, meslek, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [data.doctor_id, data.full_name, data.phone ?? null, data.date_of_birth ?? null, data.gender ?? null, data.address ?? null, data.meslek ?? null, data.notes ?? null]
      );
      return rows[0];
    } catch (error) {
      console.error("[db.createPatient] failed:", error);
      remoteLog.error("db.createPatient failed", { error: (error as Error).message });
      throw error;
    }
  }

  async updatePatient(id: string, data: Partial<Omit<PatientInsert, "doctor_id">>): Promise<void> {
    try {
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
    } catch (error) {
      console.error("[db.updatePatient] failed:", error);
      remoteLog.error("db.updatePatient failed", { error: (error as Error).message });
      throw error;
    }
  }

  async deletePatient(id: string): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query("BEGIN");
      try {
        await db.query(
          "DELETE FROM session_medications WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)",
          [id]
        );
        await db.query(
          "DELETE FROM appointment_reminders WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)",
          [id]
        );
        await db.query("DELETE FROM patient_notes WHERE patient_id = $1", [id]);
        await db.query("DELETE FROM appointments WHERE patient_id = $1", [id]);
        await db.query("DELETE FROM patients WHERE id = $1", [id]);
        await db.query("COMMIT");
      } catch (innerError) {
        await db.query("ROLLBACK");
        throw innerError;
      }
    } catch (error) {
      console.error("[db.deletePatient] failed:", error);
      remoteLog.error("db.deletePatient failed", { error: (error as Error).message });
      throw error;
    }
  }

  async getLastAppointmentDate(patientId: string): Promise<string | null> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<{ appointment_date: string }>(
        "SELECT appointment_date FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC LIMIT 1",
        [patientId]
      );
      return rows[0]?.appointment_date ? toISOString(rows[0].appointment_date) : null;
    } catch (error) {
      console.error("[db.getLastAppointmentDate] failed:", error);
      remoteLog.error("db.getLastAppointmentDate failed", { error: (error as Error).message });
      return null;
    }
  }

  async getPatientsForStats(): Promise<Pick<Patient, "id" | "gender" | "date_of_birth">[]> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Pick<Patient, "id" | "gender" | "date_of_birth">>(
        "SELECT id, gender, date_of_birth FROM patients"
      );
      return rows;
    } catch (error) {
      console.error("[db.getPatientsForStats] failed:", error);
      remoteLog.error("db.getPatientsForStats failed", { error: (error as Error).message });
      return [];
    }
  }

  // ── Appointments ──

  async getAppointmentsByDateRange(start: string, end: string): Promise<AppointmentWithPatient[]> {
    try {
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
        appointment_date: toISOString(r.appointment_date),
        duration_minutes: r.duration_minutes,
        notes: r.notes,
        status: r.status,
        patients: r.patient_full_name ? { full_name: r.patient_full_name } : null,
      }));
    } catch (error) {
      console.error("[db.getAppointmentsByDateRange] failed:", error);
      remoteLog.error("db.getAppointmentsByDateRange failed", { error: (error as Error).message });
      return [];
    }
  }

  async getAppointmentsByPatient(patientId: string): Promise<Appointment[]> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Appointment>(
        "SELECT * FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC",
        [patientId]
      );
      return rows.map((r) => ({ ...r, appointment_date: toISOString(r.appointment_date), created_at: toISOString(r.created_at) }));
    } catch (error) {
      console.error("[db.getAppointmentsByPatient] failed:", error);
      remoteLog.error("db.getAppointmentsByPatient failed", { error: (error as Error).message });
      return [];
    }
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Appointment>(
        "SELECT * FROM appointments WHERE id = $1",
        [id]
      );
      const r = rows[0];
      return r ? { ...r, appointment_date: toISOString(r.appointment_date), created_at: toISOString(r.created_at) } : null;
    } catch (error) {
      console.error("[db.getAppointment] failed:", error);
      remoteLog.error("db.getAppointment failed", { error: (error as Error).message });
      return null;
    }
  }

  async createAppointment(data: AppointmentInsert): Promise<Appointment> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Appointment>(
        `INSERT INTO appointments (doctor_id, patient_id, appointment_date, duration_minutes, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [data.doctor_id, data.patient_id, data.appointment_date, data.duration_minutes ?? 60, data.notes ?? null]
      );
      const r = rows[0];
      return { ...r, appointment_date: toISOString(r.appointment_date), created_at: toISOString(r.created_at) };
    } catch (error) {
      console.error("[db.createAppointment] failed:", error);
      remoteLog.error("db.createAppointment failed", { error: (error as Error).message });
      throw error;
    }
  }

  async updateAppointment(id: string, data: Partial<Pick<Appointment, "notes" | "status">>): Promise<void> {
    try {
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
    } catch (error) {
      console.error("[db.updateAppointment] failed:", error);
      remoteLog.error("db.updateAppointment failed", { error: (error as Error).message });
      throw error;
    }
  }

  async deleteAppointment(id: string): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query("DELETE FROM appointments WHERE id = $1", [id]);
    } catch (error) {
      console.error("[db.deleteAppointment] failed:", error);
      remoteLog.error("db.deleteAppointment failed", { error: (error as Error).message });
      throw error;
    }
  }

  async getMonthlyAppointmentDates(start: string, end: string): Promise<string[]> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<{ appointment_date: string }>(
        "SELECT appointment_date FROM appointments WHERE appointment_date >= $1 AND appointment_date <= $2",
        [start, end]
      );
      return rows.map((r) => toISOString(r.appointment_date));
    } catch (error) {
      console.error("[db.getMonthlyAppointmentDates] failed:", error);
      remoteLog.error("db.getMonthlyAppointmentDates failed", { error: (error as Error).message });
      return [];
    }
  }

  async getAppointmentsForStats(): Promise<Pick<Appointment, "id" | "appointment_date" | "status">[]> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Pick<Appointment, "id" | "appointment_date" | "status">>(
        "SELECT id, appointment_date, status FROM appointments"
      );
      return rows.map((r) => ({ ...r, appointment_date: toISOString(r.appointment_date) }));
    } catch (error) {
      console.error("[db.getAppointmentsForStats] failed:", error);
      remoteLog.error("db.getAppointmentsForStats failed", { error: (error as Error).message });
      return [];
    }
  }

  async getAppointmentsForConflictCheck(
    dayStart: string,
    dayEnd: string,
    excludeId?: string
  ): Promise<AppointmentWithPatient[]> {
    try {
      const db = await getPGlite();
      let sql = `
        SELECT a.id, a.patient_id, a.appointment_date, a.duration_minutes, a.notes, a.status,
               p.full_name as patient_full_name
        From appointments a
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
        appointment_date: toISOString(r.appointment_date),
        duration_minutes: r.duration_minutes,
        notes: r.notes,
        status: r.status,
        patients: r.patient_full_name ? { full_name: r.patient_full_name } : null,
      }));
    } catch (error) {
      console.error("[db.getAppointmentsForConflictCheck] failed:", error);
      remoteLog.error("db.getAppointmentsForConflictCheck failed", { error: (error as Error).message });
      return [];
    }
  }

  async getUpcomingAppointments(now: string, tomorrow: string): Promise<UpcomingAppointment[]> {
    try {
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
        appointment_date: toISOString(r.appointment_date),
        patients: r.patient_full_name ? { full_name: r.patient_full_name } : null,
      }));
    } catch (error) {
      console.error("[db.getUpcomingAppointments] failed:", error);
      remoteLog.error("db.getUpcomingAppointments failed", { error: (error as Error).message });
      return [];
    }
  }

  // ── Medications ──

  async getMedicationsByAppointment(appointmentId: string): Promise<Medication[]> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Medication>(
        "SELECT * FROM session_medications WHERE appointment_id = $1 ORDER BY created_at",
        [appointmentId]
      );
      return rows;
    } catch (error) {
      console.error("[db.getMedicationsByAppointment] failed:", error);
      remoteLog.error("db.getMedicationsByAppointment failed", { error: (error as Error).message });
      return [];
    }
  }

  async getMedicationsByAppointmentIds(ids: string[]): Promise<MedicationWithDate[]> {
    if (ids.length === 0) return [];
    try {
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
        appointment_date: toISOString(r.appointment_date) || "",
      }));
    } catch (error) {
      console.error("[db.getMedicationsByAppointmentIds] failed:", error);
      remoteLog.error("db.getMedicationsByAppointmentIds failed", { error: (error as Error).message });
      return [];
    }
  }

  async getAllMedicationsWithDetails(): Promise<MedicationRecord[]> {
    try {
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
        created_at: toISOString(r.created_at),
        appointment: r.appointment_date
          ? {
              appointment_date: toISOString(r.appointment_date),
              patient: r.patient_id ? { id: r.patient_id, full_name: r.patient_full_name! } : null,
            }
          : null,
      }));
    } catch (error) {
      console.error("[db.getAllMedicationsWithDetails] failed:", error);
      remoteLog.error("db.getAllMedicationsWithDetails failed", { error: (error as Error).message });
      return [];
    }
  }

  async createMedication(data: MedicationInsert): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query(
        `INSERT INTO session_medications (appointment_id, medication_name, dosage, instructions)
         VALUES ($1, $2, $3, $4)`,
        [data.appointment_id, data.medication_name, data.dosage ?? null, data.instructions ?? null]
      );
    } catch (error) {
      console.error("[db.createMedication] failed:", error);
      remoteLog.error("db.createMedication failed", { error: (error as Error).message });
      throw error;
    }
  }

  async deleteMedication(id: string): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query("DELETE FROM session_medications WHERE id = $1", [id]);
    } catch (error) {
      console.error("[db.deleteMedication] failed:", error);
      remoteLog.error("db.deleteMedication failed", { error: (error as Error).message });
      throw error;
    }
  }

  // ── Notifications ──

  async getNotifications(limit = 20): Promise<Notification[]> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<Notification>(
        "SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1",
        [limit]
      );
      return rows;
    } catch (error) {
      console.error("[db.getNotifications] failed:", error);
      remoteLog.error("db.getNotifications failed", { error: (error as Error).message });
      return [];
    }
  }

  async getNotificationsByAppointmentIds(ids: string[]): Promise<{ related_appointment_id: string }[]> {
    if (ids.length === 0) return [];
    try {
      const db = await getPGlite();
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
      const { rows } = await db.query<{ related_appointment_id: string }>(
        `SELECT related_appointment_id FROM notifications WHERE related_appointment_id IN (${placeholders})`,
        ids
      );
      return rows;
    } catch (error) {
      console.error("[db.getNotificationsByAppointmentIds] failed:", error);
      remoteLog.error("db.getNotificationsByAppointmentIds failed", { error: (error as Error).message });
      return [];
    }
  }

  async createNotification(data: NotificationInsert): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query(
        `INSERT INTO notifications (user_id, title, message, type, related_appointment_id, related_patient_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.user_id, data.title, data.message, data.type ?? "info", data.related_appointment_id ?? null, data.related_patient_id ?? null]
      );
    } catch (error) {
      console.error("[db.createNotification] failed:", error);
      remoteLog.error("db.createNotification failed", { error: (error as Error).message });
      throw error;
    }
  }

  async markNotificationRead(id: string): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query("UPDATE notifications SET is_read = true WHERE id = $1", [id]);
    } catch (error) {
      console.error("[db.markNotificationRead] failed:", error);
      remoteLog.error("db.markNotificationRead failed", { error: (error as Error).message });
      throw error;
    }
  }

  async markAllNotificationsRead(): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query("UPDATE notifications SET is_read = true WHERE is_read = false");
    } catch (error) {
      console.error("[db.markAllNotificationsRead] failed:", error);
      remoteLog.error("db.markAllNotificationsRead failed", { error: (error as Error).message });
      throw error;
    }
  }

  async deleteNotification(id: string): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query("DELETE FROM notifications WHERE id = $1", [id]);
    } catch (error) {
      console.error("[db.deleteNotification] failed:", error);
      remoteLog.error("db.deleteNotification failed", { error: (error as Error).message });
      throw error;
    }
  }

  subscribeToNotifications(callback: () => void): { unsubscribe: () => void } {
    // PGlite has no realtime — use polling
    const interval = setInterval(callback, 10000);
    return { unsubscribe: () => clearInterval(interval) };
  }

  // ── Reminders ──

  async createReminder(data: ReminderInsert): Promise<void> {
    try {
      const db = await getPGlite();
      await db.query(
        `INSERT INTO appointment_reminders (appointment_id, reminder_type, reminder_time)
         VALUES ($1, $2, $3)`,
        [data.appointment_id, data.reminder_type, data.reminder_time]
      );
    } catch (error) {
      console.error("[db.createReminder] failed:", error);
      remoteLog.error("db.createReminder failed", { error: (error as Error).message });
      throw error;
    }
  }

  // ── Profiles ──

  async getProfile(): Promise<{ full_name: string } | null> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<{ full_name: string }>(
        "SELECT full_name FROM profiles LIMIT 1"
      );
      return rows[0] || null;
    } catch (error) {
      console.error("[db.getProfile] failed:", error);
      remoteLog.error("db.getProfile failed", { error: (error as Error).message });
      return null;
    }
  }

  // ── Patient name lookup ──

  async getPatientName(id: string): Promise<{ id: string; full_name: string } | null> {
    try {
      const db = await getPGlite();
      const { rows } = await db.query<{ id: string; full_name: string }>(
        "SELECT id, full_name FROM patients WHERE id = $1",
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("[db.getPatientName] failed:", error);
      remoteLog.error("db.getPatientName failed", { error: (error as Error).message });
      return null;
    }
  }
}
