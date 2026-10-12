/**
 * Supabase sync — the device's PGlite database is the primary copy; Supabase is the
 * cloud copy. Two entry points:
 *  - syncToSupabase(): push every local row to the cloud (used on close and logout).
 *  - syncFromSupabase(): pull rows that are missing or newer in the cloud, then push
 *    every local row (used on first start, after a failed close-sync, and by the
 *    "Verileri Senkronize Et" button).
 * Uploads go in chunks; a failing chunk is retried row by row so one bad record can
 * never block the rest. Any failure is reported as success:false — never hidden.
 */
import { getPGlite } from "./pglite/init";
import { supabase } from "@/integrations/supabase/client";
import { remoteLog } from "./remote-logger";
import {
  sanitizeRow,
  shouldOverwriteLocal,
  summarizeUploads,
  uploadRows,
  type Row,
  type UploadResult,
} from "./sync-utils";
import type { PGlite } from "@electric-sql/pglite";

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Parents before children: uploads must satisfy foreign keys. */
const SYNC_TABLES = [
  "patients",
  "appointments",
  "patient_notes",
  "session_medications",
  "appointment_reminders",
  "notifications",
] as const;
type SyncTable = (typeof SYNC_TABLES)[number];
const ALLOWED_TABLES = new Set<string>(SYNC_TABLES);

function validateTableName(table: string): SyncTable {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return table as SyncTable;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
  }
  return {
    apikey: SYNC_KEY,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

// ── Helpers ──

async function fetchTable(
  table: string,
  headers: Record<string, string>,
  userId: string,
  signal?: AbortSignal
): Promise<Row[]> {
  const safeName = validateTableName(table);
  let url = `${SYNC_URL}/rest/v1/${safeName}?select=*`;
  const ownerCol = safeName === "notifications" ? "user_id" : "doctor_id";
  if (["patients", "appointments", "patient_notes", "notifications"].includes(safeName)) {
    url += `&${ownerCol}=eq.${encodeURIComponent(userId)}`;
  }
  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${safeName} indirilemedi (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Row[];
}

async function readLocalTable(db: PGlite, table: string): Promise<Row[]> {
  const { rows } = await db.query(`SELECT * FROM ${validateTableName(table)}`);
  return rows as Row[];
}

async function uploadAllLocal(
  db: PGlite,
  headers: Record<string, string>,
  signal?: AbortSignal,
  onTable?: (table: string) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const table of SYNC_TABLES) {
    onTable?.(table);
    const rows = await readLocalTable(db, table);
    const result = await uploadRows({ table, rows, url: SYNC_URL, headers, signal });
    if (result.failed.length > 0) {
      remoteLog.error(`Sync upload failed: ${table}`, {
        failed: result.failed.length,
        attempted: result.attempted,
        sample: result.failed.slice(0, 5),
      });
    }
    results.push(result);
  }
  return results;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// ── Network status ──

export function isOnline(): boolean {
  return navigator.onLine;
}

export async function hasSyncCredentials(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

// ── Push: local → Supabase ──

export async function syncToSupabase(signal?: AbortSignal): Promise<{ success: boolean; message: string }> {
  if (!isOnline()) {
    return { success: false, message: "Çevrimdışısınız. Veriler sonraki bağlantıda yedeklenecek." };
  }

  try {
    const headers = await getAuthHeaders();
    const db = await getPGlite();
    const results = await uploadAllLocal(db, headers, signal);
    const summary = summarizeUploads(results);
    return { success: summary.ok, message: summary.message };
  } catch (error: unknown) {
    if (isAbort(error)) {
      return { success: false, message: "Yedekleme zaman aşımına uğradı. Tekrar deneyin." };
    }
    const msg = error instanceof Error ? error.message : "Yedekleme hatası";
    console.error("Sync upload error:", error);
    remoteLog.error("syncToSupabase failed", { error: msg });
    return { success: false, message: msg };
  }
}

// ── Merge: Supabase → local, then local → Supabase ──

export interface SyncProgress {
  step: string;
  percent: number;
}

const SYNC_TIMEOUT_MS = 120000; // 2 minutes, for large data sets

interface TableSpec {
  name: SyncTable;
  insertSql: string;
  insertParams: (r: Row) => unknown[];
}

function tableSpecs(userId: string): TableSpec[] {
  return [
    {
      name: "patients",
      insertSql: `INSERT INTO patients (id,doctor_id,full_name,phone,date_of_birth,notes,gender,address,meslek,created_at,updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                   ON CONFLICT(id) DO UPDATE SET
                     full_name=EXCLUDED.full_name, phone=EXCLUDED.phone, date_of_birth=EXCLUDED.date_of_birth,
                     notes=EXCLUDED.notes, gender=EXCLUDED.gender, address=EXCLUDED.address, meslek=EXCLUDED.meslek,
                     updated_at=EXCLUDED.updated_at`,
      insertParams: (r) => [r.id, userId, r.full_name, r.phone, r.date_of_birth, r.notes, r.gender, r.address, r.meslek ?? null, r.created_at, r.updated_at],
    },
    {
      name: "appointments",
      insertSql: `INSERT INTO appointments (id,doctor_id,patient_id,appointment_date,duration_minutes,status,notes,created_at,updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                   ON CONFLICT(id) DO UPDATE SET
                     appointment_date=EXCLUDED.appointment_date, duration_minutes=EXCLUDED.duration_minutes,
                     status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at`,
      insertParams: (r) => [r.id, userId, r.patient_id, r.appointment_date, r.duration_minutes, r.status, r.notes, r.created_at, r.updated_at],
    },
    {
      name: "patient_notes",
      insertSql: `INSERT INTO patient_notes (id,patient_id,doctor_id,title,content,created_at,updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)
                   ON CONFLICT(id) DO UPDATE SET
                     title=EXCLUDED.title, content=EXCLUDED.content, updated_at=EXCLUDED.updated_at`,
      insertParams: (r) => [r.id, r.patient_id, userId, r.title, r.content, r.created_at, r.updated_at],
    },
    {
      name: "session_medications",
      insertSql: `INSERT INTO session_medications (id,appointment_id,medication_name,dosage,instructions,created_at)
                   VALUES ($1,$2,$3,$4,$5,$6)
                   ON CONFLICT(id) DO UPDATE SET
                     medication_name=EXCLUDED.medication_name, dosage=EXCLUDED.dosage,
                     instructions=EXCLUDED.instructions`,
      insertParams: (r) => [r.id, r.appointment_id, r.medication_name, r.dosage, r.instructions, r.created_at],
    },
    {
      name: "appointment_reminders",
      insertSql: `INSERT INTO appointment_reminders (id,appointment_id,reminder_type,reminder_time,is_sent,sent_at,error_message,created_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                   ON CONFLICT(id) DO UPDATE SET
                     is_sent=EXCLUDED.is_sent, sent_at=EXCLUDED.sent_at, error_message=EXCLUDED.error_message`,
      insertParams: (r) => [r.id, r.appointment_id, r.reminder_type, r.reminder_time, r.is_sent, r.sent_at, r.error_message, r.created_at],
    },
    {
      name: "notifications",
      insertSql: `INSERT INTO notifications (id,user_id,title,message,type,is_read,related_appointment_id,related_patient_id,created_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                   ON CONFLICT(id) DO UPDATE SET
                     is_read=EXCLUDED.is_read`,
      insertParams: (r) => [r.id, userId, r.title, r.message, r.type, r.is_read, r.related_appointment_id, r.related_patient_id, r.created_at],
    },
  ];
}

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
      return { success: false, message: "Önce giriş yapın" };
    }
    const userId = user.id;
    const tables = tableSpecs(userId);

    onProgress?.({ step: "Veriler karşılaştırılıyor...", percent: 5 });

    // 1. Pull: rows missing locally, or strictly newer in the cloud
    let addedToLocal = 0;
    let updatedLocal = 0;

    for (let i = 0; i < tables.length; i++) {
      if (controller.signal.aborted) throw new DOMException("Sync aborted", "AbortError");

      const t = tables[i];
      const pct = Math.round(((i + 1) / tables.length) * 60) + 10;
      onProgress?.({ step: `${t.name} indiriliyor...`, percent: pct });

      const remoteRows = await fetchTable(t.name, headers, userId, controller.signal);
      const localRows = await readLocalTable(db, t.name);
      const localById = new Map(localRows.map((r) => [String(r.id), r]));

      for (const remote of remoteRows) {
        const local = localById.get(String(remote.id));
        if (!shouldOverwriteLocal(local, remote)) continue;
        try {
          await db.query(t.insertSql, t.insertParams(sanitizeRow(remote)));
          if (local) updatedLocal++;
          else addedToLocal++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to write ${t.name} record locally:`, errMsg);
          remoteLog.error(`Sync insert failed: ${t.name}`, {
            error: errMsg,
            recordId: String(remote.id ?? "unknown"),
          });
        }
      }
    }

    // 2. Push: the full local copy, chunked, with per-row fallback
    const uploads = await uploadAllLocal(db, headers, controller.signal, (table) =>
      onProgress?.({ step: `${table} gönderiliyor...`, percent: 80 })
    );
    const upload = summarizeUploads(uploads);
    const sentToRemote = uploads.reduce((n, u) => n + u.uploaded, 0);

    // 3. Verify counts (informational)
    onProgress?.({ step: "Doğrulanıyor...", percent: 95 });
    const verification: string[] = [];
    for (const t of tables) {
      try {
        const { rows } = await db.query<{ c: number }>(`SELECT COUNT(*)::int as c FROM ${validateTableName(t.name)}`);
        const localCount = rows[0]?.c ?? 0;
        const remoteCount = (await fetchTable(t.name, headers, userId, controller.signal)).length;
        if (localCount < remoteCount) {
          verification.push(`${t.name}: lokal ${localCount} / sunucu ${remoteCount}`);
        }
      } catch {
        // verification is informational only
      }
    }

    clearTimeout(timeoutId);
    onProgress?.({ step: "Tamamlandı!", percent: 100 });

    const verifyMsg = verification.length > 0
      ? ` Uyarı: bazı tablolarda lokalde eksik kayıt var: ${verification.join(", ")}`
      : "";
    const pullMsg = `Lokale ${addedToLocal} yeni, ${updatedLocal} güncellenen kayıt alındı.`;

    if (!upload.ok) {
      return {
        success: false,
        message: `Senkronizasyon eksik kaldı. ${pullMsg} ${upload.message}${verifyMsg}`,
      };
    }
    return {
      success: true,
      message: `Senkronizasyon tamamlandı. ${pullMsg} Sunucuya ${sentToRemote} kayıt gönderildi.${verifyMsg}`,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (isAbort(error)) {
      return { success: false, message: "Senkronizasyon zaman aşımına uğradı. Tekrar deneyin." };
    }
    const msg = error instanceof Error ? error.message : "Senkronizasyon hatası";
    console.error("Merge sync error:", error);
    remoteLog.error("syncFromSupabase failed", { error: msg });
    return { success: false, message: msg };
  }
}
