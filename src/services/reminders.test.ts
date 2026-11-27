import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLITE_OPTIONS } from "./pglite/options";
import { LOCAL_MIGRATIONS_SQL } from "./pglite/migrations";
import { dueReminders, markReminderSent } from "./reminders";

// Regression for bug-hunt M4 (2026-11-27): the doctor's reminder choice (1 h / 3 h / 1 day /
// 2 days) was stored in appointment_reminders but never read; the bell used a fixed 24 h
// window, checked once per start. Measured: 1164 reminders vs 12 notifications.

const SCHEMA = readFileSync(join(__dirname, "pglite", "schema.sql"), "utf8");
const P = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
const NOW = new Date("2026-11-27T10:00:00Z");
const iso = (offsetMin: number) => new Date(NOW.getTime() + offsetMin * 60_000).toISOString();

async function appointment(id: string, startOffsetMin: number, reminderOffsetMin: number, status = "scheduled") {
  await db.query(
    "INSERT INTO appointments (id, doctor_id, patient_id, appointment_date, status) VALUES ($1, 'doc', $2, $3, $4)",
    [id, P, iso(startOffsetMin), status],
  );
  await db.query(
    "INSERT INTO appointment_reminders (appointment_id, reminder_type, reminder_time) VALUES ($1, 'x', $2)",
    [id, iso(reminderOffsetMin)],
  );
}

beforeEach(async () => {
  db = new PGlite(PGLITE_OPTIONS);
  await db.exec(SCHEMA);
  await db.exec(LOCAL_MIGRATIONS_SQL);
  await db.query("INSERT INTO patients (id, doctor_id, full_name) VALUES ($1, 'doc', 'Ayşe')", [P]);
});

afterEach(async () => {
  await db.close();
});

describe("dueReminders", () => {
  it("returns reminders whose time has come for future scheduled appointments", async () => {
    const due = "22222222-2222-4222-8222-222222222221";
    const notYet = "22222222-2222-4222-8222-222222222222";
    const past = "22222222-2222-4222-8222-222222222223";
    const cancelled = "22222222-2222-4222-8222-222222222224";
    await appointment(due, 120, -60); // starts in 2 h, 3 h reminder already due
    await appointment(notYet, 3000, 1500); // 2 days ahead, reminder tomorrow
    await appointment(past, -30, -90); // already started
    await appointment(cancelled, 60, -10, "cancelled");
    const rows = await dueReminders(db, NOW.toISOString());
    expect(rows.map((r) => r.appointment_id)).toEqual([due]);
    expect(rows[0].patient_full_name).toBe("Ayşe");
  });

  it("does not return a reminder again after it is marked sent", async () => {
    const id = "22222222-2222-4222-8222-222222222225";
    await appointment(id, 120, -60);
    const [first] = await dueReminders(db, NOW.toISOString());
    await markReminderSent(db, first.reminder_id, NOW.toISOString());
    expect(await dueReminders(db, NOW.toISOString())).toEqual([]);
  });
});
