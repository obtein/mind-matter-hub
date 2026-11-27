import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLITE_OPTIONS } from "./options";

// Regression for bug-hunt H4 (2026-11-27): PGlite parses DATE (oid 1082) into a JS Date.
// usePatients put that Date into the edit form's string field, so <input type="date"> showed
// nothing and every save failed with "Geçersiz doğum tarihi".

describe("PGlite DATE parsing", () => {
  it("default PGlite returns a JS Date for DATE (the cause)", async () => {
    const db = new PGlite();
    const { rows } = await db.query<{ d: unknown }>("SELECT '1985-03-10'::date AS d");
    expect(rows[0].d).toBeInstanceOf(Date);
    await db.close();
  });

  it("app options return DATE as the plain 'YYYY-MM-DD' string", async () => {
    const db = new PGlite(PGLITE_OPTIONS);
    const { rows } = await db.query<{ d: unknown; n: unknown }>(
      "SELECT '1985-03-10'::date AS d, NULL::date AS n",
    );
    expect(rows[0].d).toBe("1985-03-10");
    expect(rows[0].n).toBeNull();
    await db.close();
  });

  it("keeps timestamptz parsing unchanged (still a Date)", async () => {
    const db = new PGlite(PGLITE_OPTIONS);
    const { rows } = await db.query<{ t: unknown }>("SELECT '2026-11-27T10:00:00Z'::timestamptz AS t");
    expect(rows[0].t).toBeInstanceOf(Date);
    await db.close();
  });
});
