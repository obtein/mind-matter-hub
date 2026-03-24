import { PGlite } from "@electric-sql/pglite";

let db: PGlite | null = null;
let currentUserId: string | null = null;

/**
 * Login sonrası çağır — kullanıcıya özel DB'yi başlatır.
 * Farklı kullanıcı gelirse eski DB kapatılır, yenisi açılır.
 */
export async function initUserDb(userId: string): Promise<PGlite> {
  if (userId !== currentUserId && db) {
    await db.close();
    db = null;
  }
  currentUserId = userId;
  return getPGlite();
}

/**
 * Her kullanıcı için ayrı IndexedDB: idb://psitrak_{userId}
 */
export async function getPGlite(): Promise<PGlite> {
  if (!db) {
    const dbName = currentUserId ? `idb://psitrak_${currentUserId}` : "idb://psitrak_default";

    db = new PGlite(dbName);
    await db.waitReady;

    const result = await db.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patients')"
    );
    if (!result.rows[0]?.exists) {
      await initializeSchema(db);
    }

    await runMigrations(db);
  }
  return db;
}

/**
 * Mevcut kullanıcı ID'sini döndürür (DB switch kontrolü için)
 */
export function getCurrentDbUserId(): string | null {
  return currentUserId;
}

/**
 * Logout sırasında DB bağlantısını kapat
 */
export async function closePGlite(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    currentUserId = null;
  }
}

async function initializeSchema(pglite: PGlite) {
  const schemaModule = await import("./schema.sql?raw");
  await pglite.exec(schemaModule.default);
}

async function runMigrations(pglite: PGlite) {
  const hasMeslek = await pglite.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'meslek')"
  );
  if (!hasMeslek.rows[0]?.exists) {
    await pglite.exec("ALTER TABLE patients ADD COLUMN meslek TEXT");
  }
}
