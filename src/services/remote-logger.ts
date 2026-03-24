/**
 * Remote Logger — Kritik hataları Supabase'e gönderir.
 * Uygulama crash olsa bile hata kaydı Supabase'de kalır.
 */

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let appVersion = "unknown";
try {
  appVersion = __APP_VERSION__;
} catch { /* vite define olmayabilir */ }

type LogLevel = "error" | "warn" | "info";

interface LogEntry {
  user_email?: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  app_version?: string;
  platform?: string;
}

async function sendLog(entry: LogEntry): Promise<void> {
  try {
    await fetch(`${SYNC_URL}/rest/v1/app_logs`, {
      method: "POST",
      headers: {
        apikey: SYNC_KEY,
        Authorization: `Bearer ${SYNC_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        ...entry,
        app_version: entry.app_version || appVersion,
        platform: entry.platform || (typeof window !== "undefined" && (window as any).__TAURI__ ? "desktop" : "web"),
      }),
    });
  } catch {
    // Log gönderimi başarısız — sessizce geç, döngüye girme
  }
}

function getUserEmail(): string | undefined {
  try {
    const raw = localStorage.getItem("sb-vhdhwnvfomwzauvqozxo-auth-token");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.user?.email;
    }
  } catch { /* */ }
  return undefined;
}

export const remoteLog = {
  error(message: string, context?: Record<string, unknown>) {
    console.error("[RemoteLog]", message, context);
    sendLog({ level: "error", message, context, user_email: getUserEmail() });
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn("[RemoteLog]", message, context);
    sendLog({ level: "warn", message, context, user_email: getUserEmail() });
  },
  info(message: string, context?: Record<string, unknown>) {
    sendLog({ level: "info", message, context, user_email: getUserEmail() });
  },
};

// Global hata yakalayıcı — yakalanmayan hatalar otomatik loglanır
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    remoteLog.error(`Uncaught: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    remoteLog.error(`Unhandled Promise: ${event.reason}`, {
      stack: event.reason?.stack?.substring(0, 500),
    });
  });
}

declare const __APP_VERSION__: string;
