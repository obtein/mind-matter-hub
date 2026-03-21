import { PGlite } from "@electric-sql/pglite";

let db: PGlite | null = null;

export async function getPGlite(): Promise<PGlite> {
  if (!db) {
    console.log("[PGlite] Initializing database...");
    db = new PGlite("idb://patienthub");
    await db.waitReady;
    console.log("[PGlite] Database ready");

    // Check if schema is already initialized
    const result = await db.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patients')"
    );
    if (!result.rows[0]?.exists) {
      console.log("[PGlite] Schema not found, initializing...");
      await initializeSchema(db);
      console.log("[PGlite] Schema initialized successfully");
    } else {
      console.log("[PGlite] Schema already exists");
    }
  }
  return db;
}

async function initializeSchema(pglite: PGlite) {
  const schemaModule = await import("./schema.sql?raw");
  try {
    await pglite.exec(schemaModule.default);
  } catch (err) {
    console.error("[PGlite] Schema init failed:", err);
    throw err;
  }
}
