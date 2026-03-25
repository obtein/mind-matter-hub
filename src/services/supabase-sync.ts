import { getPGlite } from "./pglite/init";
import { supabase } from "@/integrations/supabase/client";
import { remoteLog } from "./remote-logger";

// ── Supabase REST API (credentials from .env via supabase client) ──

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Whitelist of allowed table names to prevent injection
const ALLOWED_TABLES = new Set([
  "patients", "appointments", "patient_notes",
  "session_medications", "appointment_reminders", "notifications",
]);

function validateTableName(table: string): string {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return table;
}

/** Convert any Date objects to ISO strings for Supabase compatibility */
function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (val instanceof Date) {
      sanitized[key] = val.toISOString();
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

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

async function upsertTable(
  table: string,
  rows: Record<string, unknown>[],
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<void> {
  if (rows.length === 0) return;
  const safeName = validateTableName(table);
  const safeRows = rows.map(sanitizeRow);

  const res = await fetch(`${SYNC_URL}/rest/v1/${safeName}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(safeRows),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Sync upload [${safeName}]:`, errText);
    remoteLog.error(`Sync upload failed: ${safeName}`, { error: errText });
  }
}

async function fetchTable(
  table: string,
  headers: Record<string, string>,
  userId?: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  const safeName = validateTableName(table);
  let url = `${SYNC_URL}/rest/v1/${safeName}?select=*`;
  if (userId) {
    const ownerCol = safeName === "notifications" ? "user_id" : "doctor_id";
    if (["patients", "appointments", "patient_notes", "notifications"].includes(safeName)) {
      url += `&${ownerCol}=eq.${encodeURIComponent(userId)}`;
    }
  }

  try {
    const res = await fetch(url, { headers, signal });
    if (!res.ok) return [];
    return await res.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`Fetch aborted for ${safeName}`);
    }
    return [];
  }
}

// ── Network status ──

export function isOnline(): boolean {
  return navigator.onLine;
}

// ── Upload: Lokal → Supabase ──

export async function hasSyncCredentials(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

export async function syncToSupabase(signal?: AbortSignal): Promise<{ success: boolean; message: string }> {
  if (!isOnline()) {
    return { success: false, message: "Çevrimdışısınız. Veriler sonraki bağlantıda yedeklenecek." };
  }

  try {
    const headers = await getAuthHeaders();
    const db = await getPGlite();

    const tableNames = [
      "patients", "appointments", "patient_notes",
      "session_medications", "appointment_reminders", "notifications",
    ];

    for (const table of tableNames) {
      const { rows } = await db.query(`SELECT * FROM ${validateTableName(table)}`);
      await upsertTable(table, rows as Record<string, unknown>[], headers, signal);
    }

    return { success: true, message: "Veriler basariyla yedeklendi" };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Yedekleme hatasi";
    console.error("Sync upload error:", error);
    remoteLog.error("syncToSupabase failed", { error: msg });
    return { success: false, message: msg };
  }
}

// ── Merge Sync: İki yönlü senkronizasyon ──

export interface SyncProgress {
  step: string;
  percent: number;
}

const SYNC_TIMEOUT_MS = 120000; // 2 dakika (büyük veri setleri için)

export async function syncFromSupabase(
  onProgress?: (p: SyncProgress) => void
): Promise<{ success: boolean; message: string }> {
  if (!isOnline()) {
    return { success: false, message: "Çevrimdışısınız. İnternet bağlantınızı kontrol edin." };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const headers = await getAuthHeaders();
    const db = await getPGlite();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      clearTimeout(timeoutId);
      return { success: false, message: "Once giris yapin" };
    }
    const userId = user.id;

    onProgress?.({ step: "Veriler karsilastiriliyor...", percent: 5 });

    const tables = [
      {
        name: "patients",
        idCol: "id",
        insertSql: `INSERT INTO patients (id,doctor_id,full_name,phone,date_of_birth,notes,gender,address,meslek,created_at,updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                     ON CONFLICT(id) DO UPDATE SET
                       full_name=EXCLUDED.full_name, phone=EXCLUDED.phone, date_of_birth=EXCLUDED.date_of_birth,
                       notes=EXCLUDED.notes, gender=EXCLUDED.gender, address=EXCLUDED.address, meslek=EXCLUDED.meslek,
                       updated_at=EXCLUDED.updated_at
                     WHERE patients.updated_at < EXCLUDED.updated_at`,
        insertParams: (r: Record<string, unknown>) => [r.id, userId, r.full_name, r.phone, r.date_of_birth, r.notes, r.gender, r.address, r.meslek ?? null, r.created_at, r.updated_at],
      },
      {
        name: "appointments",
        idCol: "id",
        insertSql: `INSERT INTO appointments (id,doctor_id,patient_id,appointment_date,duration_minutes,status,notes,created_at,updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                     ON CONFLICT(id) DO UPDATE SET
                       appointment_date=EXCLUDED.appointment_date, duration_minutes=EXCLUDED.duration_minutes,
                       status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at
                     WHERE appointments.updated_at < EXCLUDED.updated_at`,
        insertParams: (r: Record<string, unknown>) => [r.id, userId, r.patient_id, r.appointment_date, r.duration_minutes, r.status, r.notes, r.created_at, r.updated_at],
      },
      {
        name: "patient_notes",
        idCol: "id",
        insertSql: `INSERT INTO patient_notes (id,patient_id,doctor_id,title,content,created_at,updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT(id) DO UPDATE SET
                       title=EXCLUDED.title, content=EXCLUDED.content, updated_at=EXCLUDED.updated_at
                     WHERE patient_notes.updated_at < EXCLUDED.updated_at`,
        insertParams: (r: Record<string, unknown>) => [r.id, r.patient_id, userId, r.title, r.content, r.created_at, r.updated_at],
      },
      {
        name: "session_medications",
        idCol: "id",
        insertSql: `INSERT INTO session_medications (id,appointment_id,medication_name,dosage,instructions,created_at)
                     VALUES ($1,$2,$3,$4,$5,$6)
                     ON CONFLICT(id) DO UPDATE SET
                       medication_name=EXCLUDED.medication_name, dosage=EXCLUDED.dosage,
                       instructions=EXCLUDED.instructions`,
        insertParams: (r: Record<string, unknown>) => [r.id, r.appointment_id, r.medication_name, r.dosage, r.instructions, r.created_at],
      },
      {
        name: "appointment_reminders",
        idCol: "id",
        insertSql: `INSERT INTO appointment_reminders (id,appointment_id,reminder_type,reminder_time,is_sent,sent_at,error_message,created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                     ON CONFLICT(id) DO UPDATE SET
                       is_sent=EXCLUDED.is_sent, sent_at=EXCLUDED.sent_at, error_message=EXCLUDED.error_message`,
        insertParams: (r: Record<string, unknown>) => [r.id, r.appointment_id, r.reminder_type, r.reminder_time, r.is_sent, r.sent_at, r.error_message, r.created_at],
      },
      {
        name: "notifications",
        idCol: "id",
        insertSql: `INSERT INTO notifications (id,user_id,title,message,type,is_read,related_appointment_id,related_patient_id,created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                     ON CONFLICT(id) DO UPDATE SET
                       is_read=EXCLUDED.is_read`,
        insertParams: (r: Record<string, unknown>) => [r.id, userId, r.title, r.message, r.type, r.is_read, r.related_appointment_id, r.related_patient_id, r.created_at],
      },
    ];

    let addedToLocal = 0;
    let addedToRemote = 0;

    for (let i = 0; i < tables.length; i++) {
      if (controller.signal.aborted) break;

      const t = tables[i];
      const pct = Math.round(((i + 1) / tables.length) * 80) + 10;
      onProgress?.({ step: `${t.name} senkronize ediliyor...`, percent: pct });

      const remoteRows = await fetchTable(t.name, headers, userId, controller.signal);
      const { rows: localRows } = await db.query(`SELECT * FROM ${validateTableName(t.name)}`);

      const localIds = new Set((localRows as Record<string, unknown>[]).map((r) => r[t.idCol]));
      const remoteIds = new Set(remoteRows.map((r) => r[t.idCol]));

      // Supabase'de olup lokalde olmayan → lokale ekle
      const missingInLocal = remoteRows.filter((r) => !localIds.has(r[t.idCol]));
      // Ayrıca lokalde olan ama güncellenmiş olabilecek kayıtlar → güncelle
      const existingInBoth = remoteRows.filter((r) => localIds.has(r[t.idCol]));

      for (const r of missingInLocal) {
        try {
          await db.query(t.insertSql, t.insertParams(sanitizeRow(r)));
          addedToLocal++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to insert ${t.name} record:`, errMsg);
          remoteLog.error(`Sync insert failed: ${t.name}`, {
            error: errMsg,
            recordId: String(r[t.idCol] ?? "unknown"),
            isFkError: errMsg.includes("foreign key") || errMsg.includes("violates"),
          });
        }
      }

      // Mevcut kayıtları da güncelle (ON CONFLICT DO UPDATE)
      for (const r of existingInBoth) {
        try {
          await db.query(t.insertSql, t.insertParams(sanitizeRow(r)));
        } catch {
          // Update failed — skip silently (already exists with current data)
        }
      }

      // Lokalde olup Supabase'de olmayan → Supabase'e ekle
      const missingInRemote = (localRows as Record<string, unknown>[]).filter((r) => !remoteIds.has(r[t.idCol]));
      if (missingInRemote.length > 0) {
        await upsertTable(t.name, missingInRemote, headers, controller.signal);
        addedToRemote += missingInRemote.length;
      }
    }

    // Sync sonrası doğrulama — kayıt sayılarını karşılaştır
    onProgress?.({ step: "Doğrulanıyor...", percent: 95 });
    const verification: string[] = [];
    for (const t of tables) {
      try {
        const { rows: localCount } = await db.query(`SELECT COUNT(*)::int as c FROM ${validateTableName(t.name)}`);
        const remoteCount = (await fetchTable(t.name, headers, userId, controller.signal)).length;
        const localC = (localCount as Record<string, unknown>[])[0]?.c as number ?? 0;
        if (localC < remoteCount) {
          verification.push(`${t.name}: lokal ${localC} / sunucu ${remoteCount}`);
        }
      } catch {
        // Doğrulama hatası — kritik değil
      }
    }

    clearTimeout(timeoutId);
    onProgress?.({ step: "Tamamlandi!", percent: 100 });

    const verifyMsg = verification.length > 0
      ? ` Uyarı: Bazı tablolarda eksik kayıt var: ${verification.join(", ")}`
      : "";

    return {
      success: true,
      message: `Senkronizasyon tamamlandi. Lokale ${addedToLocal}, sunucuya ${addedToRemote} kayit eklendi.${verifyMsg}`,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const msg = error instanceof Error ? error.message : "Senkronizasyon hatasi";
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, message: "Senkronizasyon zaman asimina ugradi. Tekrar deneyin." };
    }
    console.error("Merge sync error:", error);
    remoteLog.error("syncFromSupabase failed", { error: msg });
    return { success: false, message: msg };
  }
}
