import { getPGlite } from "./pglite/init";

// ── Hardcoded Supabase credentials (ortak proje) ──

const SYNC_SUPABASE_URL = "https://vhdhwnvfomwzauvqozxo.supabase.co";
const SYNC_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZGh3bnZmb213emF1dnFvenhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMTYwMjMsImV4cCI6MjA4OTY5MjAyM30.w58tok4ZmJGlkEqBfF1meH3BXJJLqM1ji5w4R8yWvsc";

// ── Settings helpers ──

async function getSetting(key: string): Promise<string | null> {
  const db = await getPGlite();
  const { rows } = await db.query<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getPGlite();
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value]
  );
}

// ── Supabase Auth ──

async function ensureSupabaseUser(
  email: string,
  password: string
): Promise<string> {
  // Önce mevcut token var mı kontrol et
  const cachedToken = await getSetting("sync_access_token");
  const cachedExpiry = await getSetting("sync_token_expiry");

  if (cachedToken && cachedExpiry && Date.now() < Number(cachedExpiry)) {
    return cachedToken;
  }

  // Login dene
  let res = await fetch(`${SYNC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SYNC_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  // Login başarısızsa signup dene (ilk kez)
  if (!res.ok) {
    const signupRes = await fetch(`${SYNC_SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: SYNC_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!signupRes.ok) {
      throw new Error("Yedekleme hesabi olusturulamadi");
    }

    // Signup sonrası tekrar login
    res = await fetch(`${SYNC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SYNC_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      throw new Error("Yedekleme girisi basarisiz");
    }
  }

  const data = await res.json();
  const token = data.access_token as string;
  const uid = data.user?.id as string;

  // Token'ı cache'le (55 dk - 5 dk buffer)
  await setSetting("sync_access_token", token);
  await setSetting("sync_token_expiry", String(Date.now() + 55 * 60 * 1000));
  await setSetting("sync_supabase_uid", uid);

  return token;
}

// ── Upsert helper ──

async function upsertTable(
  token: string,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  const res = await fetch(`${SYNC_SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SYNC_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Sync error [${table}]:`, errText);
  }
}

// ── Public API ──

export async function hasSyncCredentials(): Promise<boolean> {
  // Credentials artık hardcoded, sadece kullanıcı bilgisi lazım
  const db = await getPGlite();
  const { rows } = await db.query("SELECT COUNT(*)::int as count FROM local_users");
  return (rows[0] as any)?.count > 0;
}

export async function syncToSupabase(): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getPGlite();

    // Lokal kullanıcı bilgilerini al
    const { rows: users } = await db.query<{ id: string; email: string; password_hash: string }>(
      "SELECT id, email, password_hash FROM local_users LIMIT 1"
    );
    const localUser = users[0];
    if (!localUser) {
      return { success: false, message: "Yerel kullanici bulunamadi" };
    }

    // Supabase'e authenticate ol (veya signup)
    const token = await ensureSupabaseUser(localUser.email, localUser.password_hash);
    const supabaseUid = await getSetting("sync_supabase_uid");

    if (!supabaseUid) {
      return { success: false, message: "Supabase kullanici ID alinamadi" };
    }

    // doctor_id'yi Supabase UID ile değiştirerek upsert et
    // Patients
    const { rows: patients } = await db.query("SELECT * FROM patients");
    const mappedPatients = (patients as Record<string, unknown>[]).map((p) => ({
      ...p,
      doctor_id: supabaseUid,
    }));
    await upsertTable(token, "patients", mappedPatients);

    // Appointments
    const { rows: appointments } = await db.query("SELECT * FROM appointments");
    const mappedAppointments = (appointments as Record<string, unknown>[]).map((a) => ({
      ...a,
      doctor_id: supabaseUid,
    }));
    await upsertTable(token, "appointments", mappedAppointments);

    // Patient notes
    const { rows: notes } = await db.query("SELECT * FROM patient_notes");
    const mappedNotes = (notes as Record<string, unknown>[]).map((n) => ({
      ...n,
      doctor_id: supabaseUid,
    }));
    await upsertTable(token, "patient_notes", mappedNotes);

    // Session medications (no doctor_id, linked via appointment FK)
    const { rows: meds } = await db.query("SELECT * FROM session_medications");
    await upsertTable(token, "session_medications", meds as Record<string, unknown>[]);

    // Appointment reminders
    const { rows: reminders } = await db.query("SELECT * FROM appointment_reminders");
    await upsertTable(token, "appointment_reminders", reminders as Record<string, unknown>[]);

    // Notifications
    const { rows: notifications } = await db.query("SELECT * FROM notifications");
    const mappedNotifications = (notifications as Record<string, unknown>[]).map((n) => ({
      ...n,
      user_id: supabaseUid,
    }));
    await upsertTable(token, "notifications", mappedNotifications);

    return { success: true, message: "Veriler basariyla yedeklendi" };
  } catch (error: any) {
    console.error("Sync error:", error);
    return { success: false, message: error.message || "Yedekleme sirasinda hata olustu" };
  }
}
