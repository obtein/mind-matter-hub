import { getPGlite } from "./pglite/init";

const SUPABASE_USER_ID = "a9f91bc2-55b6-41b8-bbc1-a258d7a22b8c";

export interface MigrationData {
  profiles: any[];
  user_roles: any[];
  patients: any[];
  appointments: any[];
  patient_notes: any[];
  session_medications: any[];
  appointment_reminders: any[];
  notifications: any[];
}

export type MigrationProgress = {
  step: string;
  current: number;
  total: number;
};

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function migrateFromSupabase(
  data: MigrationData,
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: boolean; message: string }> {
  const db = await getPGlite();

  const report = (step: string, current: number, total: number) => {
    onProgress?.({ step, current, total });
  };

  try {
    // ── Step 1: Create local user ──
    report("Yerel kullanici olusturuluyor...", 0, 8);

    const hash = await hashPassword("07031994");

    // Check if user already exists
    const { rows: existingUsers } = await db.query<{ id: string }>(
      "SELECT id FROM local_users WHERE email = $1",
      ["seytekin@gmail.com"]
    );

    let localUserId: string;

    if (existingUsers.length > 0) {
      localUserId = existingUsers[0].id;
    } else {
      const { rows: newUserRows } = await db.query<{ id: string }>(
        `INSERT INTO local_users (email, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ["seytekin@gmail.com", hash, "Doktor"]
      );
      localUserId = newUserRows[0].id;
    }

    // ── Step 2: Clear existing data (in reverse FK order) ──
    report("Mevcut veriler temizleniyor...", 0, 8);

    await db.query("DELETE FROM appointment_reminders");
    await db.query("DELETE FROM notifications");
    await db.query("DELETE FROM session_medications");
    await db.query("DELETE FROM patient_notes");
    await db.query("DELETE FROM appointments");
    await db.query("DELETE FROM patients");
    await db.query("DELETE FROM user_roles WHERE user_id = $1", [localUserId]);
    await db.query("DELETE FROM profiles WHERE user_id = $1", [localUserId]);

    // ── Step 3: Insert profiles ──
    report("Profiller aktariliyor...", 1, 8);

    for (const profile of data.profiles) {
      const userId = profile.user_id === SUPABASE_USER_ID ? localUserId : profile.user_id;
      await db.query(
        `INSERT INTO profiles (id, user_id, full_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name`,
        [
          profile.id,
          userId,
          profile.full_name,
          profile.created_at,
          profile.updated_at,
        ]
      );
    }

    // ── Step 4: Insert user_roles ──
    report("Kullanici rolleri aktariliyor...", 2, 8);

    for (const role of data.user_roles) {
      const userId = role.user_id === SUPABASE_USER_ID ? localUserId : role.user_id;
      await db.query(
        `INSERT INTO user_roles (id, user_id, role, created_at)
         VALUES ($1, $2, $3::user_role, $4)
         ON CONFLICT (user_id, role) DO NOTHING`,
        [role.id, userId, role.role, role.created_at]
      );
    }

    // ── Step 5: Insert patients ──
    report("Hastalar aktariliyor...", 3, 8);

    for (let i = 0; i < data.patients.length; i++) {
      const p = data.patients[i];
      const doctorId = p.doctor_id === SUPABASE_USER_ID ? localUserId : p.doctor_id;
      await db.query(
        `INSERT INTO patients (id, doctor_id, full_name, phone, date_of_birth, notes, gender, address, meslek, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
          doctorId,
          p.full_name,
          p.phone,
          p.date_of_birth,
          p.notes,
          p.gender,
          p.address,
          (p as any).meslek ?? null,
          p.created_at,
          p.updated_at,
        ]
      );
    }

    // ── Step 6: Insert appointments ──
    report("Randevular aktariliyor...", 4, 8);

    for (let i = 0; i < data.appointments.length; i++) {
      const a = data.appointments[i];
      const doctorId = a.doctor_id === SUPABASE_USER_ID ? localUserId : a.doctor_id;
      await db.query(
        `INSERT INTO appointments (id, doctor_id, patient_id, appointment_date, duration_minutes, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          a.id,
          doctorId,
          a.patient_id,
          a.appointment_date,
          a.duration_minutes,
          a.status,
          a.notes,
          a.created_at,
          a.updated_at,
        ]
      );
    }

    // ── Step 7: Insert patient_notes ──
    report("Hasta notlari aktariliyor...", 5, 8);

    for (const n of data.patient_notes) {
      const doctorId = n.doctor_id === SUPABASE_USER_ID ? localUserId : n.doctor_id;
      await db.query(
        `INSERT INTO patient_notes (id, patient_id, doctor_id, title, content, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [n.id, n.patient_id, doctorId, n.title, n.content, n.created_at, n.updated_at]
      );
    }

    // ── Step 8: Insert session_medications ──
    report("Ilac kayitlari aktariliyor...", 6, 8);

    for (const m of data.session_medications) {
      await db.query(
        `INSERT INTO session_medications (id, appointment_id, medication_name, dosage, instructions, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [m.id, m.appointment_id, m.medication_name, m.dosage, m.instructions, m.created_at]
      );
    }

    // ── Step 9: Insert appointment_reminders ──
    report("Hatirlaticilar aktariliyor...", 7, 8);

    for (const r of data.appointment_reminders) {
      await db.query(
        `INSERT INTO appointment_reminders (id, appointment_id, reminder_type, reminder_time, is_sent, sent_at, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id,
          r.appointment_id,
          r.reminder_type,
          r.reminder_time,
          r.is_sent,
          r.sent_at,
          r.error_message,
          r.created_at,
        ]
      );
    }

    // ── Step 10: Insert notifications ──
    report("Bildirimler aktariliyor...", 8, 8);

    for (const n of data.notifications) {
      const userId = n.user_id === SUPABASE_USER_ID ? localUserId : n.user_id;
      await db.query(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read, related_appointment_id, related_patient_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          n.id,
          userId,
          n.title,
          n.message,
          n.type,
          n.is_read,
          n.related_appointment_id,
          n.related_patient_id,
          n.created_at,
        ]
      );
    }

    const totalRecords =
      data.profiles.length +
      data.user_roles.length +
      data.patients.length +
      data.appointments.length +
      data.patient_notes.length +
      data.session_medications.length +
      data.appointment_reminders.length +
      data.notifications.length;

    return {
      success: true,
      message: `Aktarim basarili! Toplam ${totalRecords} kayit aktarildi. (${data.patients.length} hasta, ${data.appointments.length} randevu, ${data.patient_notes.length} not, ${data.session_medications.length} ilac, ${data.appointment_reminders.length} hatirlatici, ${data.notifications.length} bildirim)`,
    };
  } catch (error: any) {
    console.error("Migration error:", error);
    return {
      success: false,
      message: `Aktarim hatasi: ${error.message || "Bilinmeyen hata"}`,
    };
  }
}

export async function fetchSupabaseData(
  supabaseUrl: string,
  accessToken: string,
  anonKey?: string
): Promise<MigrationData> {
  const headers = {
    apikey: anonKey || accessToken,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const tables = [
    "profiles",
    "user_roles",
    "patients",
    "appointments",
    "patient_notes",
    "session_medications",
    "appointment_reminders",
    "notifications",
  ] as const;

  const results: Record<string, any[]> = {};

  for (const table of tables) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
      headers,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${table} tablosu alinamadi: ${res.status} - ${errText}`);
    }

    results[table] = await res.json();
  }

  return results as unknown as MigrationData;
}

export async function authenticateSupabase(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase giris hatasi: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}
