import { PGlite } from "@electric-sql/pglite";

let db: PGlite | null = null;
let currentUserId: string | null = null;
let initPromise: Promise<PGlite> | null = null;
let closing = false;

/**
 * Login sonrası çağır — kullanıcıya özel DB'yi başlatır.
 * Farklı kullanıcı gelirse eski DB kapatılır, yenisi açılır.
 * Mutex ile concurrent çağrılar korunur.
 */
export async function initUserDb(userId: string): Promise<PGlite> {
  if (userId !== currentUserId) {
    // Önceki close tamamlanana kadar bekle
    while (closing) await new Promise((r) => setTimeout(r, 50));
    if (db) {
      closing = true;
      try { await db.close(); } catch { /* ignore */ }
      db = null;
      initPromise = null;
      closing = false;
    }
  }
  currentUserId = userId;
  return getPGlite();
}

/**
 * Her kullanıcı için ayrı IndexedDB: idb://psitrak_{userId}
 * Concurrent çağrılarda aynı promise döner (mutex).
 */
export async function getPGlite(): Promise<PGlite> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dbName = currentUserId ? `idb://psitrak_${currentUserId}` : "idb://psitrak_default";

    const instance = new PGlite(dbName);
    await instance.waitReady;

    const result = await instance.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patients')"
    );
    if (!result.rows[0]?.exists) {
      await initializeSchema(instance);
    }

    await runMigrations(instance);
    db = instance;
    return instance;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
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
    closing = true;
    try { await db.close(); } catch { /* ignore */ }
    db = null;
    initPromise = null;
    currentUserId = null;
    closing = false;
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

  // Performance indexes (idempotent)
  await pglite.exec(`
    CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);
    CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients(full_name);
    CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date DESC);
    CREATE INDEX IF NOT EXISTS idx_patient_notes_patient_id ON patient_notes(patient_id);
  `);
}
