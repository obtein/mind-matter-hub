/**
 * In-app reminders (bug-hunt M4). A reminder row is "due" when its time has come and its
 * appointment is still scheduled and in the future. The bell shows one notification per due
 * reminder and marks the reminder sent, so it never fires twice.
 */
import type { Transaction } from "@electric-sql/pglite";

type Q = Pick<Transaction, "query">;

export interface DueReminder {
  reminder_id: string;
  appointment_id: string;
  appointment_date: string;
  patient_full_name: string | null;
}

export async function dueReminders(db: Q, nowIso: string): Promise<DueReminder[]> {
  const { rows } = await db.query<{
    reminder_id: string;
    appointment_id: string;
    appointment_date: string | Date;
    patient_full_name: string | null;
  }>(
    `SELECT r.id AS reminder_id, a.id AS appointment_id, a.appointment_date, p.full_name AS patient_full_name
     FROM appointment_reminders r
     JOIN appointments a ON a.id = r.appointment_id
     LEFT JOIN patients p ON p.id = a.patient_id
     WHERE NOT r.is_sent
       AND r.reminder_time <= $1
       AND a.appointment_date > $1
       AND a.status = 'scheduled'
     ORDER BY a.appointment_date`,
    [nowIso],
  );
  return rows.map((r) => ({
    ...r,
    appointment_date: r.appointment_date instanceof Date ? r.appointment_date.toISOString() : r.appointment_date,
  }));
}

export async function markReminderSent(db: Q, reminderId: string, sentAtIso: string): Promise<void> {
  await db.query("UPDATE appointment_reminders SET is_sent = true, sent_at = $2 WHERE id = $1", [reminderId, sentAtIso]);
}
