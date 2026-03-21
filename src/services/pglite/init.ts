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

    // Run migrations for existing databases
    await runMigrations(db);
  }
  return db;
}

async function initializeSchema(pglite: PGlite) {
  const schemaModule = await import("./schema.sql?raw");
  await pglite.exec(schemaModule.default);
}

async function runMigrations(pglite: PGlite) {
  // Migration 1: Add meslek column if missing
  const hasMeslek = await pglite.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'meslek')"
  );
  if (!hasMeslek.rows[0]?.exists) {
    await pglite.exec("ALTER TABLE patients ADD COLUMN meslek TEXT");
  }
}
