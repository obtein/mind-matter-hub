import { describe, expect, it } from "vitest";
import {
  chunk,
  isValidDateString,
  sanitizeRow,
  shouldOverwriteLocal,
  summarizeUploads,
  uploadRows,
} from "./sync-utils";

// Regression for the production failure of 2026-03..2026-10:
// PGlite returned a DATE with year 20022 as a JS Date; toISOString gave
// "+020022-09-30T21:00:00.000Z"; Postgres answered 22009 and the whole
// patients batch was rejected on every sync.
describe("sanitizeRow", () => {
  it("nulls a DATE whose year Postgres cannot parse (year 20022)", () => {
    const bad = new Date(20022, 9, 1);
    expect(bad.toISOString()).toMatch(/^\+020022/);
    const row = sanitizeRow({ id: "p1", date_of_birth: bad, full_name: "x" });
    expect(row.date_of_birth).toBeNull();
    expect(row.full_name).toBe("x");
  });

  it("keeps a Postgres-valid but unusual year (0199) instead of destroying it", () => {
    const row = sanitizeRow({ date_of_birth: "0199-05-01" });
    expect(row.date_of_birth).toBe("0199-05-01");
  });

  it("serialises a normal DATE as YYYY-MM-DD without a timezone shift", () => {
    const row = sanitizeRow({ date_of_birth: new Date("1985-03-10") });
    expect(row.date_of_birth).toBe("1985-03-10");
  });

  it("trims an ISO timestamp down to the date for DATE columns", () => {
    const row = sanitizeRow({ date_of_birth: "1985-03-10T00:00:00.000Z" });
    expect(row.date_of_birth).toBe("1985-03-10");
  });

  it("keeps timestamptz columns as full ISO strings", () => {
    const d = new Date("2026-04-01T09:30:00.000Z");
    const row = sanitizeRow({ appointment_date: d, created_at: "2026-04-01T09:30:00+00:00" });
    expect(row.appointment_date).toBe("2026-04-01T09:30:00.000Z");
    expect(row.created_at).toBe("2026-04-01T09:30:00+00:00");
  });

  it("nulls unparseable date-like strings and leaves other fields alone", () => {
    const row = sanitizeRow({ reminder_time: "not a date", notes: "2026 notlar", phone: "+90 555" });
    expect(row.reminder_time).toBeNull();
    expect(row.notes).toBe("2026 notlar");
    expect(row.phone).toBe("+90 555");
  });

  it("nulls an invalid Date object", () => {
    const row = sanitizeRow({ sent_at: new Date("garbage") });
    expect(row.sent_at).toBeNull();
  });
});

describe("isValidDateString", () => {
  it("rejects six-digit and signed years", () => {
    expect(isValidDateString("+020022-09-30T21:00:00.000Z")).toBe(false);
    expect(isValidDateString("20022-10-01")).toBe(false);
    expect(isValidDateString("-000001-01-01T00:00:00.000Z")).toBe(false);
  });
  it("accepts the Postgres range 0001..9999", () => {
    expect(isValidDateString("0001-01-01")).toBe(true);
    expect(isValidDateString("9999-12-31")).toBe(true);
    expect(isValidDateString("1985-03-10")).toBe(true);
  });
  it("rejects empty and garbage", () => {
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString("yesterday")).toBe(false);
  });
});

describe("chunk", () => {
  it("splits into fixed-size pieces", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

type Call = { body: unknown[]; prefer: string | undefined };

/** fetch stub: a batch fails when it contains a row whose id is in `badIds`. */
function fakeFetch(badIds: Set<string>, calls: Call[]): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Array<{ id: string }>;
    const headers = init?.headers as Record<string, string>;
    calls.push({ body, prefer: headers?.Prefer });
    const bad = body.some((r) => badIds.has(r.id));
    return bad
      ? new Response('{"code":"22009","message":"time zone displacement out of range"}', { status: 400 })
      : new Response(null, { status: 201 });
  }) as typeof fetch;
}

describe("uploadRows", () => {
  const headers = { apikey: "k", Authorization: "Bearer t", "Content-Type": "application/json" };

  it("uploads a clean set in one chunk with merge-duplicates", async () => {
    const calls: Call[] = [];
    const rows = [{ id: "a" }, { id: "b" }];
    const res = await uploadRows({ table: "patients", rows, url: "http://x", headers, fetchImpl: fakeFetch(new Set(), calls) });
    expect(res).toEqual({ table: "patients", attempted: 2, uploaded: 2, failed: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].prefer).toContain("resolution=merge-duplicates");
  });

  it("isolates one bad row instead of losing the whole batch (the 2026 production failure)", async () => {
    const calls: Call[] = [];
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
    const res = await uploadRows({
      table: "patients",
      rows,
      url: "http://x",
      headers,
      fetchImpl: fakeFetch(new Set(["p3"]), calls),
      chunkSize: 200,
    });
    expect(res.attempted).toBe(5);
    expect(res.uploaded).toBe(4);
    expect(res.failed).toEqual([{ id: "p3", error: expect.stringContaining("22009") }]);
    // 1 failed batch + 5 single retries
    expect(calls).toHaveLength(6);
  });

  it("only retries the chunk that failed", async () => {
    const calls: Call[] = [];
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}` }));
    const res = await uploadRows({
      table: "appointments",
      rows,
      url: "http://x",
      headers,
      fetchImpl: fakeFetch(new Set(["r4"]), calls),
      chunkSize: 3,
    });
    expect(res.uploaded).toBe(5);
    expect(res.failed.map((f) => f.id)).toEqual(["r4"]);
    // chunk1 ok (1 call) + chunk2 fail (1) + 3 single retries = 5
    expect(calls).toHaveLength(5);
  });

  it("does nothing for an empty table", async () => {
    const calls: Call[] = [];
    const res = await uploadRows({ table: "notes", rows: [], url: "http://x", headers, fetchImpl: fakeFetch(new Set(), calls) });
    expect(res.uploaded).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("sanitises rows before sending", async () => {
    const calls: Call[] = [];
    await uploadRows({
      table: "patients",
      rows: [{ id: "a", date_of_birth: new Date(20022, 9, 1) }],
      url: "http://x",
      headers,
      fetchImpl: fakeFetch(new Set(), calls),
    });
    expect((calls[0].body[0] as { date_of_birth: unknown }).date_of_birth).toBeNull();
  });
});

describe("shouldOverwriteLocal", () => {
  it("inserts when there is no local row", () => {
    expect(shouldOverwriteLocal(undefined, { id: "a" })).toBe(true);
  });
  it("keeps a local edit that is newer than the stale cloud copy", () => {
    const local = { id: "a", updated_at: "2026-09-17T10:00:00Z" };
    const remote = { id: "a", updated_at: "2026-03-25T10:00:00Z" };
    expect(shouldOverwriteLocal(local, remote)).toBe(false);
  });
  it("takes the remote row only when it is strictly newer", () => {
    const local = { id: "a", updated_at: "2026-03-25T10:00:00Z" };
    expect(shouldOverwriteLocal(local, { id: "a", updated_at: "2026-09-17T10:00:00Z" })).toBe(true);
    expect(shouldOverwriteLocal(local, { id: "a", updated_at: "2026-03-25T10:00:00Z" })).toBe(false);
  });
  it("never overwrites when a table has no updated_at", () => {
    expect(shouldOverwriteLocal({ id: "m" }, { id: "m", dosage: "x" })).toBe(false);
  });
  it("accepts Date objects from PGlite", () => {
    const local = { id: "a", updated_at: new Date("2026-09-17T10:00:00Z") };
    expect(shouldOverwriteLocal(local, { id: "a", updated_at: "2026-03-25T10:00:00Z" })).toBe(false);
  });
});

describe("summarizeUploads", () => {
  it("reports success with the total", () => {
    const s = summarizeUploads([
      { table: "patients", attempted: 2, uploaded: 2, failed: [] },
      { table: "appointments", attempted: 3, uploaded: 3, failed: [] },
    ]);
    expect(s.ok).toBe(true);
    expect(s.message).toContain("5");
  });
  it("reports failure per table, never success", () => {
    const s = summarizeUploads([
      { table: "patients", attempted: 468, uploaded: 467, failed: [{ id: "p", error: "22009" }] },
    ]);
    expect(s.ok).toBe(false);
    expect(s.message).toContain("patients: 1/468");
  });
});
