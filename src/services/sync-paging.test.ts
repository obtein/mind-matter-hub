import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, parseContentRangeTotal, safeErrorText } from "./sync-utils";

// Regression for bug-hunt H3 (2026-11-27): fetchTable did one `?select=*` request; PostgREST
// caps a response at max-rows (default 1000). Measured cloud: 1166 appointments, 1164
// reminders — a restore onto a new PC would silently miss the rest.

function fakeServer(total: number, maxRows = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: String(i).padStart(5, "0") }));
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("Range") ?? "0-";
    const [from, toRaw] = range.split("-").map((x) => (x === "" ? undefined : Number(x)));
    const start = from ?? 0;
    const end = Math.min(toRaw ?? Number.MAX_SAFE_INTEGER, start + maxRows - 1, total - 1);
    const body = start >= total ? [] : rows.slice(start, end + 1);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("fetchAllPages", () => {
  it("downloads every row of a table larger than max-rows", async () => {
    const f = fakeServer(1166);
    const all = await fetchAllPages("https://x/rest/v1/appointments?select=*", {}, { fetchImpl: f });
    expect(all).toHaveLength(1166);
    expect(new Set(all.map((r) => r.id)).size).toBe(1166);
  });

  it("orders by id so pages are stable", async () => {
    const f = fakeServer(5);
    await fetchAllPages("https://x/rest/v1/patients?select=*", {}, { fetchImpl: f });
    expect(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("order=id.asc");
  });

  it("stops on an exact multiple of the page size", async () => {
    const f = fakeServer(2000);
    const all = await fetchAllPages("https://x/rest/v1/t?select=*", {}, { fetchImpl: f });
    expect(all).toHaveLength(2000);
  });

  it("throws with status on an HTTP error", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchAllPages("https://x/rest/v1/t?select=*", {}, { fetchImpl: f })).rejects.toThrow(/503/);
  });
});

describe("parseContentRangeTotal", () => {
  it("reads the total from PostgREST's Content-Range", () => {
    expect(parseContentRangeTotal("0-0/1166")).toBe(1166);
    expect(parseContentRangeTotal("*/0")).toBe(0);
    expect(parseContentRangeTotal(null)).toBeNull();
    expect(parseContentRangeTotal("0-9/*")).toBeNull();
  });
});

describe("safeErrorText (bug-hunt M5)", () => {
  it("keeps code and message but drops details and quoted values", () => {
    const body = JSON.stringify({
      code: "23514",
      message: 'new row for relation "patients" violates check constraint "x"',
      details: "Failing row contains (id, doc, Ayşe Yılmaz, 0555 123 45 67, ...).",
      hint: null,
    });
    const out = safeErrorText(400, body);
    expect(out).toContain("400");
    expect(out).toContain("23514");
    expect(out).not.toContain("Ayşe");
    expect(out).not.toContain("0555");
  });

  it("removes values quoted in the message", () => {
    const body = JSON.stringify({ code: "22007", message: 'invalid input syntax for type date: "Ayşe 1985"' });
    expect(safeErrorText(400, body)).not.toContain("Ayşe");
  });

  it("does not echo non-JSON bodies", () => {
    expect(safeErrorText(502, "<html>Ayşe</html>")).toBe("502");
  });
});

describe("fetchAllPages end of data (refuter follow-up)", () => {
  it("treats 416 (range after the last row) as the end of the data", async () => {
    let call = 0;
    const f = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }))), { status: 206 });
      }
      return new Response("", { status: 416 });
    }) as unknown as typeof fetch;
    const all = await fetchAllPages("https://x/rest/v1/t?select=*", {}, { fetchImpl: f });
    expect(all).toHaveLength(1000);
  });
});
