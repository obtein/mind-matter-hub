/**
 * Local deletes with tombstones (bug-hunt H2). Every deleted row id is written to
 * deleted_records in the same transaction as the delete. Sync pushes pending tombstones to
 * the cloud and never pulls a tombstoned id back. The cloud keeps the deleted rows.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";

export const TOMBSTONE_TABLES = [
  "patients",
  "appointments",
  "patient_notes",
  "session_medications",
  "appointment_reminders",
  "notifications",
] as const;
export type TombstoneTable = (typeof TOMBSTONE_TABLES)[number];

export interface Tombstone {
  table_name: string;
  record_id: string;
  deleted_at?: string | Date;
}

type Q = Pick<Transaction, "query">;

async function tombstone(tx: Q, table: TombstoneTable, selectIdsSql: string, params: unknown[]): Promise<void> {
  await tx.query(
    `INSERT INTO deleted_records (table_name, record_id)
     SELECT '${table}', id::text FROM (${selectIdsSql}) AS doomed
     ON CONFLICT (table_name, record_id) DO NOTHING`,
    params,
  );
}

export async function deletePatientCascade(db: PGlite, patientId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const appts = "SELECT id FROM appointments WHERE patient_id = $1";
    await tombstone(tx, "session_medications", `SELECT id FROM session_medications WHERE appointment_id IN (${appts})`, [patientId]);
    await tombstone(tx, "appointment_reminders", `SELECT id FROM appointment_reminders WHERE appointment_id IN (${appts})`, [patientId]);
    await tombstone(tx, "patient_notes", "SELECT id FROM patient_notes WHERE patient_id = $1", [patientId]);
    await tombstone(tx, "appointments", appts, [patientId]);
    await tombstone(tx, "patients", "SELECT id FROM patients WHERE id = $1", [patientId]);
    await tx.query(`DELETE FROM session_medications WHERE appointment_id IN (${appts})`, [patientId]);
    await tx.query(`DELETE FROM appointment_reminders WHERE appointment_id IN (${appts})`, [patientId]);
    await tx.query("DELETE FROM patient_notes WHERE patient_id = $1", [patientId]);
    await tx.query("DELETE FROM appointments WHERE patient_id = $1", [patientId]);
    await tx.query("DELETE FROM patients WHERE id = $1", [patientId]);
  });
}

export async function deleteAppointmentCascade(db: PGlite, appointmentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tombstone(tx, "session_medications", "SELECT id FROM session_medications WHERE appointment_id = $1", [appointmentId]);
    await tombstone(tx, "appointment_reminders", "SELECT id FROM appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    await tombstone(tx, "appointments", "SELECT id FROM appointments WHERE id = $1", [appointmentId]);
    await tx.query("DELETE FROM session_medications WHERE appointment_id = $1", [appointmentId]);
    await tx.query("DELETE FROM appointment_reminders WHERE appointment_id = $1", [appointmentId]);
    await tx.query("DELETE FROM appointments WHERE id = $1", [appointmentId]);
  });
}

export async function deleteOne(db: PGlite, table: "session_medications" | "notifications", id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tombstone(tx, table, `SELECT id FROM ${table} WHERE id = $1`, [id]);
    await tx.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  });
}

export async function pendingTombstones(db: Q): Promise<Tombstone[]> {
  const { rows } = await db.query<Tombstone>(
    "SELECT table_name, record_id, deleted_at FROM deleted_records WHERE NOT synced ORDER BY deleted_at",
  );
  return rows;
}

export async function markTombstonesSynced(db: Q, list: Tombstone[]): Promise<void> {
  for (const t of list) {
    await db.query("UPDATE deleted_records SET synced = true WHERE table_name = $1 AND record_id = $2", [
      t.table_name,
      t.record_id,
    ]);
  }
}

export async function applyRemoteTombstones(db: Q, list: Tombstone[]): Promise<void> {
  for (const t of list) {
    await db.query(
      `INSERT INTO deleted_records (table_name, record_id, synced) VALUES ($1, $2, true)
       ON CONFLICT (table_name, record_id) DO UPDATE SET synced = true`,
      [t.table_name, String(t.record_id)],
    );
  }
}

export async function tombstonedIds(db: Q, table: string): Promise<Set<string>> {
  const { rows } = await db.query<{ record_id: string }>(
    "SELECT record_id FROM deleted_records WHERE table_name = $1",
    [table],
  );
  return new Set(rows.map((r) => r.record_id));
}
