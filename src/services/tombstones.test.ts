import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLITE_OPTIONS } from "./pglite/options";
import { LOCAL_MIGRATIONS_SQL } from "./pglite/migrations";
import {
  applyRemoteTombstones,
  clearTombstonesForExistingRows,
  deleteAppointmentCascade,
  deleteOne,
  deletePatientCascade,
  markTombstonesSynced,
  pendingTombstones,
  tombstonedIds,
} from "./tombstones";

// Regression for bug-hunt H2 (2026-11-27): local deletes never reached Supabase and the next
// pull re-inserted every row that was "missing locally". Baran's rule: the cloud keeps deleted
// rows as an archive, but sync must never bring them back.
// Also L1: the updated_at trigger overwrote the timestamp that a pull wrote.

const SCHEMA = readFileSync(join(__dirname, "pglite", "schema.sql"), "utf8");
const P = "11111111-1111-4111-8111-111111111111";
const A1 = "22222222-2222-4222-8222-222222222221";
const A2 = "22222222-2222-4222-8222-222222222222";
const M1 = "33333333-3333-4333-8333-333333333331";
const R1 = "44444444-4444-4444-8444-444444444441";

let db: PGlite;

beforeEach(async () => {
  db = new PGlite(PGLITE_OPTIONS);
  await db.exec(SCHEMA);
  await db.exec(LOCAL_MIGRATIONS_SQL);
  await db.query("INSERT INTO patients (id, doctor_id, full_name) VALUES ($1, 'doc', 'Test')", [P]);
  for (const a of [A1, A2]) {
    await db.query(
      "INSERT INTO appointments (id, doctor_id, patient_id, appointment_date) VALUES ($1, 'doc', $2, now())",
      [a, P],
    );
  }
  await db.query("INSERT INTO session_medications (id, appointment_id, medication_name) VALUES ($1, $2, 'F41.1')", [M1, A1]);
  await db.query(
    "INSERT INTO appointment_reminders (id, appointment_id, reminder_type, reminder_time) VALUES ($1, $2, '1_day', now())",
    [R1, A1],
  );
});

afterEach(async () => {
  await db.close();
});

describe("local deletes record tombstones", () => {
  it("deleting a patient removes and tombstones the patient and every child row", async () => {
    await deletePatientCascade(db, P);
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments");
    expect(rows[0].n).toBe(0);
    const pending = await pendingTombstones(db);
    const keys = pending.map((t) => `${t.table_name}:${t.record_id}`).sort();
    expect(keys).toEqual(
      [`appointment_reminders:${R1}`, `appointments:${A1}`, `appointments:${A2}`, `patients:${P}`, `session_medications:${M1}`].sort(),
    );
  });

  it("rolls back rows and tombstones together when a delete fails", async () => {
    await db.exec("CREATE FUNCTION fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql");
    await db.exec("CREATE TRIGGER t BEFORE DELETE ON patients FOR EACH ROW EXECUTE FUNCTION fail()");
    await expect(deletePatientCascade(db, P)).rejects.toThrow();
    expect(await pendingTombstones(db)).toEqual([]);
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments");
    expect(rows[0].n).toBe(2);
  });

  it("deleting an appointment tombstones its medications and reminders", async () => {
    await deleteAppointmentCascade(db, A1);
    const keys = (await pendingTombstones(db)).map((t) => t.table_name).sort();
    expect(keys).toEqual(["appointment_reminders", "appointments", "session_medications"]);
  });

  it("deleting one medication tombstones only that row", async () => {
    await deleteOne(db, "session_medications", M1);
    expect((await pendingTombstones(db)).map((t) => t.record_id)).toEqual([M1]);
  });

  it("marks pushed tombstones as synced", async () => {
    await deleteOne(db, "session_medications", M1);
    await markTombstonesSynced(db, await pendingTombstones(db));
    expect(await pendingTombstones(db)).toEqual([]);
    expect((await tombstonedIds(db, "session_medications")).has(M1)).toBe(true);
  });

  it("remote tombstones are stored and block the matching ids", async () => {
    await applyRemoteTombstones(db, [{ table_name: "patients", record_id: "99999999-9999-4999-8999-999999999999" }]);
    expect((await tombstonedIds(db, "patients")).has("99999999-9999-4999-8999-999999999999")).toBe(true);
    expect(await pendingTombstones(db)).toEqual([]);
  });
});

describe("updated_at trigger (bug-hunt L1)", () => {
  it("keeps an updated_at that the writer sets (pull) and stamps now() otherwise", async () => {
    await db.query("UPDATE patients SET full_name = 'X', updated_at = '2020-01-01T00:00:00Z' WHERE id = $1", [P]);
    let { rows } = await db.query<{ u: Date }>("SELECT updated_at AS u FROM patients WHERE id = $1", [P]);
    expect(rows[0].u.toISOString()).toBe("2020-01-01T00:00:00.000Z");

    await db.query("UPDATE patients SET full_name = 'Y' WHERE id = $1", [P]);
    ({ rows } = await db.query<{ u: Date }>("SELECT updated_at AS u FROM patients WHERE id = $1", [P]));
    expect(rows[0].u.getTime()).toBeGreaterThan(new Date("2025-01-01").getTime());
  });
});

describe("refuter follow-ups", () => {
  it("a tombstone from another device also removes the local row", async () => {
    await applyRemoteTombstones(db, [{ table_name: "session_medications", record_id: M1 }]);
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM session_medications WHERE id = $1", [M1]);
    expect(rows[0].n).toBe(0);
  });

  it("ignores tombstones for unknown tables", async () => {
    await expect(applyRemoteTombstones(db, [{ table_name: "local_users", record_id: P }])).resolves.toBeUndefined();
  });

  it("restoring a row clears its local tombstone (restore = undelete)", async () => {
    await deleteOne(db, "session_medications", M1);
    await db.query("INSERT INTO session_medications (id, appointment_id, medication_name) VALUES ($1, $2, 'F41.1')", [M1, A1]);
    await clearTombstonesForExistingRows(db);
    expect((await tombstonedIds(db, "session_medications")).has(M1)).toBe(false);
  });
});
