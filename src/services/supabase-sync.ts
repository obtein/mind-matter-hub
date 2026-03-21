import { getPGlite } from "./pglite/init";

// ── Hardcoded Supabase credentials (tek kullanıcı) ──

const SYNC_URL = "https://vhdhwnvfomwzauvqozxo.supabase.co";
const SYNC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZGh3bnZmb213emF1dnFvenhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMTYwMjMsImV4cCI6MjA4OTY5MjAyM30.w58tok4ZmJGlkEqBfF1meH3BXJJLqM1ji5w4R8yWvsc";

const HEADERS = {
  apikey: SYNC_KEY,
  Authorization: `Bearer ${SYNC_KEY}`,
  "Content-Type": "application/json",
};

// ── Helpers ──

async function upsertTable(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;

  const res = await fetch(`${SYNC_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Sync upload [${table}]:`, errText);
  }
}

async function fetchTable(table: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SYNC_URL}/rest/v1/${table}?select=*`, { headers: HEADERS });
  if (!res.ok) return [];
  return await res.json();
}

// ── Upload: Lokal → Supabase ──

export async function hasSyncCredentials(): Promise<boolean> {
  const db = await getPGlite();
  const { rows } = await db.query("SELECT COUNT(*)::int as count FROM local_users");
  return (rows[0] as any)?.count > 0;
}

export async function syncToSupabase(): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getPGlite();

    const tables = [
      "patients", "appointments", "patient_notes",
      "session_medications", "appointment_reminders", "notifications",
    ];

    for (const table of tables) {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      await upsertTable(table, rows as Record<string, unknown>[]);
    }

    return { success: true, message: "Veriler basariyla yedeklendi" };
  } catch (error: any) {
    console.error("Sync upload error:", error);
    return { success: false, message: error.message || "Yedekleme hatasi" };
  }
}

// ── Download: Supabase → Lokal ──

export interface SyncProgress {
  step: string;
  percent: number;
}

export async function syncFromSupabase(
  onProgress?: (p: SyncProgress) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getPGlite();

    // Lokal kullanıcı var mı kontrol
    const { rows: users } = await db.query<{ id: string }>("SELECT id FROM local_users LIMIT 1");
    if (!users[0]) {
      return { success: false, message: "Once giris yapin" };
    }
    const localUserId = users[0].id;

    onProgress?.({ step: "Sunucudan veriler indiriliyor...", percent: 10 });

    // Tabloları Supabase'den çek
    const tableNames = ["patients", "appointments", "patient_notes", "session_medications", "appointment_reminders", "notifications"] as const;
    const data: Record<string, Record<string, unknown>[]> = {};

    for (let i = 0; i < tableNames.length; i++) {
      const table = tableNames[i];
      onProgress?.({ step: `${table} indiriliyor...`, percent: 10 + Math.round(((i + 1) / tableNames.length) * 40) });
      data[table] = await fetchTable(table);
    }

    onProgress?.({ step: "Yerel veritabani guncelleniyor...", percent: 55 });

    await db.exec("BEGIN");
    try {
      // FK sırasına göre sil
      for (const t of ["appointment_reminders", "notifications", "session_medications", "patient_notes", "appointments", "patients"]) {
        await db.exec(`DELETE FROM ${t}`);
      }

      onProgress?.({ step: "Hastalar ekleniyor...", percent: 60 });
      for (const r of data.patients as any[]) {
        await db.query(
          `INSERT INTO patients (id,doctor_id,full_name,phone,date_of_birth,notes,gender,address,meslek,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,
          [r.id, localUserId, r.full_name, r.phone, r.date_of_birth, r.notes, r.gender, r.address, r.meslek ?? null, r.created_at, r.updated_at]
        );
      }

      onProgress?.({ step: "Randevular ekleniyor...", percent: 70 });
      for (const r of data.appointments as any[]) {
        await db.query(
          `INSERT INTO appointments (id,doctor_id,patient_id,appointment_date,duration_minutes,status,notes,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
          [r.id, localUserId, r.patient_id, r.appointment_date, r.duration_minutes, r.status, r.notes, r.created_at, r.updated_at]
        );
      }

      onProgress?.({ step: "Notlar ekleniyor...", percent: 75 });
      for (const r of data.patient_notes as any[]) {
        await db.query(
          `INSERT INTO patient_notes (id,patient_id,doctor_id,title,content,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
          [r.id, r.patient_id, localUserId, r.title, r.content, r.created_at, r.updated_at]
        );
      }

      onProgress?.({ step: "Ilaclar ekleniyor...", percent: 80 });
      for (const r of data.session_medications as any[]) {
        await db.query(
          `INSERT INTO session_medications (id,appointment_id,medication_name,dosage,instructions,created_at)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
          [r.id, r.appointment_id, r.medication_name, r.dosage, r.instructions, r.created_at]
        );
      }

      onProgress?.({ step: "Hatirlaticilar ekleniyor...", percent: 90 });
      for (const r of data.appointment_reminders as any[]) {
        await db.query(
          `INSERT INTO appointment_reminders (id,appointment_id,reminder_type,reminder_time,is_sent,sent_at,error_message,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
          [r.id, r.appointment_id, r.reminder_type, r.reminder_time, r.is_sent, r.sent_at, r.error_message, r.created_at]
        );
      }

      for (const r of data.notifications as any[]) {
        await db.query(
          `INSERT INTO notifications (id,user_id,title,message,type,is_read,related_appointment_id,related_patient_id,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
          [r.id, localUserId, r.title, r.message, r.type, r.is_read, r.related_appointment_id, r.related_patient_id, r.created_at]
        );
      }

      await db.exec("COMMIT");
    } catch (err) {
      await db.exec("ROLLBACK");
      throw err;
    }

    onProgress?.({ step: "Tamamlandi!", percent: 100 });

    const total = data.patients.length + data.appointments.length + data.patient_notes.length +
      data.session_medications.length + data.appointment_reminders.length + data.notifications.length;

    return {
      success: true,
      message: `${total} kayit senkronize edildi. (${data.patients.length} hasta, ${data.appointments.length} randevu, ${data.session_medications.length} ilac)`,
    };
  } catch (error: any) {
    console.error("SyncFrom error:", error);
    return { success: false, message: error.message || "Senkronizasyon hatasi" };
  }
}
