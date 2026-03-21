import { getPGlite } from "./pglite/init";

const BACKUP_VERSION = "1.0.0";
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

interface BackupData {
  version: string;
  exportDate: string;
  tables: {
    patients: unknown[];
    appointments: unknown[];
    patient_notes: unknown[];
    session_medications: unknown[];
    appointment_reminders: unknown[];
    notifications: unknown[];
    profiles: unknown[];
    user_roles: unknown[];
    local_users: unknown[];
    app_settings: unknown[];
  };
}

// ── Key derivation ──

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 } as AesKeyGenParams,
    false,
    ["encrypt", "decrypt"]
  );
}

// ── Encrypt / Decrypt ──

async function encrypt(data: string, password: string): Promise<ArrayBuffer> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(data)
  );

  // Format: [salt (16)] [iv (12)] [ciphertext (...)]
  const result = new Uint8Array(SALT_LENGTH + IV_LENGTH + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, SALT_LENGTH);
  result.set(new Uint8Array(encrypted), SALT_LENGTH + IV_LENGTH);
  return result.buffer;
}

async function decrypt(buffer: ArrayBuffer, password: string): Promise<string> {
  const data = new Uint8Array(buffer);
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ── Export ──

export async function exportBackup(password: string): Promise<{ data: ArrayBuffer; filename: string }> {
  const db = await getPGlite();

  const tableNames = [
    "patients", "appointments", "patient_notes", "session_medications",
    "appointment_reminders", "notifications", "profiles", "user_roles",
    "local_users", "app_settings",
  ] as const;

  const tables: Record<string, unknown[]> = {};
  for (const table of tableNames) {
    const { rows } = await db.query(`SELECT * FROM ${table}`);
    tables[table] = rows;
  }

  const backup: BackupData = {
    version: BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    tables: tables as BackupData["tables"],
  };

  const json = JSON.stringify(backup);
  const encrypted = await encrypt(json, password);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `psitrak-yedek-${date}.phub`;

  return { data: encrypted, filename };
}

// ── Import ──

export async function importBackup(buffer: ArrayBuffer, password: string): Promise<void> {
  let json: string;
  try {
    json = await decrypt(buffer, password);
  } catch {
    throw new Error("Şifre hatalı veya dosya bozuk.");
  }

  let backup: BackupData;
  try {
    backup = JSON.parse(json);
  } catch {
    throw new Error("Yedek dosyası geçersiz format.");
  }

  if (!backup.version || !backup.tables) {
    throw new Error("Yedek dosyası uyumsuz format.");
  }

  const db = await getPGlite();

  // Run in a transaction — all or nothing
  await db.exec("BEGIN");
  try {
    // Order matters due to foreign keys — delete children first
    const deleteOrder = [
      "app_settings", "notifications", "appointment_reminders",
      "session_medications", "patient_notes", "appointments",
      "patients", "user_roles", "profiles", "local_users",
    ];

    for (const table of deleteOrder) {
      await db.exec(`DELETE FROM ${table}`);
    }

    // Insert order — parents first
    const insertOrder = [
      "local_users", "profiles", "user_roles", "patients",
      "appointments", "patient_notes", "session_medications",
      "appointment_reminders", "notifications", "app_settings",
    ] as const;

    for (const table of insertOrder) {
      const rows = backup.tables[table];
      if (!rows || rows.length === 0) continue;

      for (const row of rows) {
        const obj = row as Record<string, unknown>;
        const keys = Object.keys(obj);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const columns = keys.join(", ");
        const values = keys.map((k) => obj[k]);

        await db.query(
          `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
          values
        );
      }
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

// ── Platform detection ──

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

// ── File helpers ──

export async function downloadBackup(password: string): Promise<void> {
  const { data, filename } = await exportBackup(password);

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    const path = await save({
      defaultPath: filename,
      filters: [{ name: "PsiTrak Yedek", extensions: ["phub"] }],
    });

    if (!path) return;
    try {
      await writeFile(path, new Uint8Array(data));
    } catch (err) {
      console.error("writeFile error:", err, "path:", path);
      throw new Error("Dosya yazılamadı: " + (err instanceof Error ? err.message : String(err)));
    }
  } else {
    // Web fallback — trigger browser download
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export async function uploadAndRestoreBackup(password: string): Promise<void> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");

    const path = await open({
      filters: [{ name: "PsiTrak Yedek", extensions: ["phub"] }],
      multiple: false,
    });

    if (!path) return;
    const fileContent = await readFile(path as string);
    const buffer = fileContent.buffer as ArrayBuffer;

    await importBackup(buffer, password);
  } else {
    // Web fallback — file picker via <input>
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".phub";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return reject(new Error("Dosya seçilmedi"));
        resolve(await file.arrayBuffer());
      };
      input.click();
    });

    await importBackup(buffer, password);
  }
}
