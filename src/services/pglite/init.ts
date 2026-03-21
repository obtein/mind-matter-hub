import { PGlite } from "@electric-sql/pglite";

let db: PGlite | null = null;

export async function getPGlite(): Promise<PGlite> {
  if (!db) {
    db = new PGlite("idb://patienthub");
    await db.waitReady;

    const result = await db.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patients')"
    );
    if (!result.rows[0]?.exists) {
      await initializeSchema(db);
    }
  }
  return db;
}

async function initializeSchema(pglite: PGlite) {
  const schemaModule = await import("./schema.sql?raw");
  await pglite.exec(schemaModule.default);
}
