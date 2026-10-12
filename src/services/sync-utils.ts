/**
 * Pure helpers for the Supabase sync. No PGlite, no supabase client, no DOM.
 * Everything here is unit-tested in sync-utils.test.ts.
 */

export type Row = Record<string, unknown>;

/** Postgres accepts ISO-8601 input only for years 1..9999. */
const MIN_PG_YEAR = 1;
const MAX_PG_YEAR = 9999;

/** Columns stored as Postgres DATE (not timestamptz). Serialised as YYYY-MM-DD. */
const DATE_ONLY_COLUMNS = new Set(["date_of_birth"]);

function isDateLikeKey(key: string): boolean {
  return key.includes("date") || key.includes("_at") || key.includes("time");
}

function yearInPgRange(year: number): boolean {
  return Number.isFinite(year) && year >= MIN_PG_YEAR && year <= MAX_PG_YEAR;
}

/** Returns true when Postgres can parse the value as a date or timestamp. */
export function isValidDateString(s: string): boolean {
  if (typeof s !== "string" || s.trim() === "") return false;
  // A 6-digit (or longer) year, as produced by Date#toISOString for year > 9999 ("+020022-..."),
  // or a leading sign, is never accepted by Postgres ISO input.
  if (/^[+-]/.test(s) || /^\d{5,}/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && yearInPgRange(d.getUTCFullYear());
}

function dateToPgString(d: Date, dateOnly: boolean): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (!yearInPgRange(year)) return null;
  if (dateOnly) {
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${String(year).padStart(4, "0")}-${m}-${day}`;
  }
  return d.toISOString();
}

/**
 * Make a PGlite row safe for PostgREST JSON:
 * - Date objects become ISO strings (or YYYY-MM-DD for DATE columns);
 * - date-like strings Postgres cannot parse become null;
 * - everything else passes through unchanged.
 * A value that cannot be represented is nulled so that one bad field never blocks a batch.
 */
export function sanitizeRow(row: Row): Row {
  const out: Row = {};
  for (const [key, val] of Object.entries(row)) {
    const dateOnly = DATE_ONLY_COLUMNS.has(key);
    if (val instanceof Date) {
      out[key] = dateToPgString(val, dateOnly);
    } else if (typeof val === "string" && isDateLikeKey(key)) {
      if (!isValidDateString(val)) {
        out[key] = null;
      } else if (dateOnly && val.length > 10) {
        out[key] = val.slice(0, 10);
      } else {
        out[key] = val;
      }
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface RowFailure {
  id: string | null;
  error: string;
}

export interface UploadResult {
  table: string;
  attempted: number;
  uploaded: number;
  failed: RowFailure[];
}

export interface UploadOptions {
  table: string;
  rows: Row[];
  url: string;
  headers: Record<string, string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  chunkSize?: number;
}

async function postRows(
  fetchImpl: typeof fetch,
  url: string,
  table: string,
  rows: Row[],
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchImpl(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
    signal,
  });
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  return { ok: false, error: `${res.status} ${text}`.trim() };
}

/**
 * Upsert rows in chunks. PostgREST applies a batch atomically, so when a chunk fails
 * every row of that chunk is retried alone and only the bad rows are reported.
 * Never throws for HTTP errors; throws only on abort or network failure.
 */
export async function uploadRows(opts: UploadOptions): Promise<UploadResult> {
  const { table, rows, url, headers, signal } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const size = opts.chunkSize ?? 200;
  const result: UploadResult = { table, attempted: rows.length, uploaded: 0, failed: [] };
  if (rows.length === 0) return result;

  const safeRows = rows.map(sanitizeRow);
  for (const batch of chunk(safeRows, size)) {
    if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");
    const batchRes = await postRows(fetchImpl, url, table, batch, headers, signal);
    if (batchRes.ok) {
      result.uploaded += batch.length;
      continue;
    }
    if (batch.length === 1) {
      result.failed.push({ id: idOf(batch[0]), error: batchRes.error ?? "unknown error" });
      continue;
    }
    for (const row of batch) {
      if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");
      const one = await postRows(fetchImpl, url, table, [row], headers, signal);
      if (one.ok) result.uploaded += 1;
      else result.failed.push({ id: idOf(row), error: one.error ?? "unknown error" });
    }
  }
  return result;
}

function idOf(row: Row): string | null {
  const id = row.id;
  return typeof id === "string" ? id : id == null ? null : String(id);
}

/**
 * Decide whether a remote row may overwrite the local copy of the same id.
 * Only when both carry a parseable updated_at and the remote one is strictly newer.
 * Tables without updated_at keep the local row: the device is the primary copy.
 */
export function shouldOverwriteLocal(local: Row | undefined, remote: Row): boolean {
  if (!local) return true;
  const l = toTime(local.updated_at);
  const r = toTime(remote.updated_at);
  if (l === null || r === null) return false;
  return r > l;
}

function toTime(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Human-readable (Turkish) summary of an upload run, used in toasts and logs. */
export function summarizeUploads(results: UploadResult[]): { ok: boolean; message: string } {
  const failed = results.filter((r) => r.failed.length > 0);
  if (failed.length === 0) {
    const total = results.reduce((n, r) => n + r.uploaded, 0);
    return { ok: true, message: `Veriler yedeklendi (${total} kayıt).` };
  }
  const parts = failed.map((r) => `${r.table}: ${r.failed.length}/${r.attempted}`);
  return {
    ok: false,
    message: `Yedekleme eksik kaldı. Gönderilemeyen kayıtlar: ${parts.join(", ")}.`,
  };
}
