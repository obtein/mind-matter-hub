import { getPGlite } from "./pglite/init";
import { supabase } from "@/integrations/supabase/client";

// ── Supabase REST API (credentials from .env via supabase client) ──

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getHeaders(accessToken?: string) {
  return {
    apikey: SYNC_KEY,
    Authorization: `Bearer ${accessToken || SYNC_KEY}`,
    "Content-Type": "application/json",
  };
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return getHeaders(session?.access_token);
}

// ── Helpers ──

async function upsertTable(table: string, rows: Record<string, unknown>[], headers: Record<string, string>): Promise<void> {
  if (rows.length === 0) return;

  const res = await fetch(`${SYNC_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Sync upload [${table}]:`, errText);
  }
}

async function fetchTable(table: string, headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SYNC_URL}/rest/v1/${table}?select=*`, { headers });
  if (!res.ok) return [];
  return await res.json();
}

// ── Upload: Lokal → Supabase ──

export async function hasSyncCredentials(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

export async function syncToSupabase(): Promise<{ success: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders();
    const db = await getPGlite();

    const tables = [
      "patients", "appointments", "patient_notes",
      "session_medications", "appointment_reminders", "notifications",
    ];

    for (const table of tables) {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      await upsertTable(table, rows as Record<string, unknown>[], headers);
    }

    return { success: true, message: "Veriler basariyla yedeklendi" };
  } catch (error: any) {
    console.error("Sync upload error:", error);
    return { success: false, message: error.message || "Yedekleme hatasi" };
  }
}

// ── Merge Sync: İki yönlü senkronizasyon ──
// Lokalde eksik olanı Supabase'den ekle, Supabase'de eksik olanı lokale ekle.
// Hiçbir veri silinmez.

export interface SyncProgress {
  step: string;
  percent: number;
}

export async function syncFromSupabase(
  onProgress?: (p: SyncProgress) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders();
    const db = await getPGlite();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, message: "Once giris yapin" };
    }
    const userId = user.id;

    onProgress?.({ step: "Veriler karsilastiriliyor...", percent: 5 });

    // Tablo tanımları: isim, ID kolonu, doctor/user kolonu, insert SQL
    const tables = [
      {
        name: "patients",
        idCol: "id",
        ownerCol: "doctor_id",
        insertSql: `INSERT INTO patients (id,doctor_id,full_name,phone,date_of_birth,notes,gender,address,meslek,created_at,updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,
        insertParams: (r: any) => [r.id, userId, r.full_name, r.phone, r.date_of_birth, r.notes, r.gender, r.address, r.meslek ?? null, r.created_at, r.updated_at],
      },
      {
        name: "appointments",
        idCol: "id",
        ownerCol: "doctor_id",
        insertSql: `INSERT INTO appointments (id,doctor_id,patient_id,appointment_date,duration_minutes,status,notes,created_at,updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
        insertParams: (r: any) => [r.id, userId, r.patient_id, r.appointment_date, r.duration_minutes, r.status, r.notes, r.created_at, r.updated_at],
      },
      {
        name: "patient_notes",
        idCol: "id",
        ownerCol: "doctor_id",
        insertSql: `INSERT INTO patient_notes (id,patient_id,doctor_id,title,content,created_at,updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
        insertParams: (r: any) => [r.id, r.patient_id, userId, r.title, r.content, r.created_at, r.updated_at],
      },
      {
        name: "session_medications",
        idCol: "id",
        ownerCol: null,
        insertSql: `INSERT INTO session_medications (id,appointment_id,medication_name,dosage,instructions,created_at)
                     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
        insertParams: (r: any) => [r.id, r.appointment_id, r.medication_name, r.dosage, r.instructions, r.created_at],
      },
      {
        name: "appointment_reminders",
        idCol: "id",
        ownerCol: null,
        insertSql: `INSERT INTO appointment_reminders (id,appointment_id,reminder_type,reminder_time,is_sent,sent_at,error_message,created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
        insertParams: (r: any) => [r.id, r.appointment_id, r.reminder_type, r.reminder_time, r.is_sent, r.sent_at, r.error_message, r.created_at],
      },
      {
        name: "notifications",
        idCol: "id",
        ownerCol: "user_id",
        insertSql: `INSERT INTO notifications (id,user_id,title,message,type,is_read,related_appointment_id,related_patient_id,created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
        insertParams: (r: any) => [r.id, userId, r.title, r.message, r.type, r.is_read, r.related_appointment_id, r.related_patient_id, r.created_at],
      },
    ];

    let addedToLocal = 0;
    let addedToRemote = 0;

    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      const pct = Math.round(((i + 1) / tables.length) * 80) + 10;
      onProgress?.({ step: `${t.name} senkronize ediliyor...`, percent: pct });

      // Her iki taraftan ID'leri çek
      const remoteRows = await fetchTable(t.name, headers);
      const { rows: localRows } = await db.query(`SELECT * FROM ${t.name}`);

      const localIds = new Set((localRows as any[]).map((r) => r[t.idCol]));
      const remoteIds = new Set(remoteRows.map((r) => r[t.idCol]));

      // Supabase'de olup lokalde olmayan → lokale ekle
      const missingInLocal = remoteRows.filter((r) => !localIds.has(r[t.idCol]));
      for (const r of missingInLocal) {
        await db.query(t.insertSql, t.insertParams(r));
        addedToLocal++;
      }

      // Lokalde olup Supabase'de olmayan → Supabase'e ekle
      const missingInRemote = (localRows as any[]).filter((r) => !remoteIds.has(r[t.idCol]));
      if (missingInRemote.length > 0) {
        await upsertTable(t.name, missingInRemote, headers);
        addedToRemote += missingInRemote.length;
      }
    }

    onProgress?.({ step: "Tamamlandi!", percent: 100 });

    return {
      success: true,
      message: `Senkronizasyon tamamlandi. Lokale ${addedToLocal}, sunucuya ${addedToRemote} kayit eklendi.`,
    };
  } catch (error: any) {
    console.error("Merge sync error:", error);
    return { success: false, message: error.message || "Senkronizasyon hatasi" };
  }
}
