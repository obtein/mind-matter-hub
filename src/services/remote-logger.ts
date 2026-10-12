/**
 * Remote logger — sends warnings and errors to the Supabase app_logs table so that a
 * crash on the device still leaves a trace the admin can read.
 * Uses the user's session token when logged in; falls back to the anon key before login
 * (the table allows anonymous inserts for exactly this case).
 */
import { IS_TAURI } from "@/lib/platform";
import { supabase } from "@/integrations/supabase/client";

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let appVersion = "unknown";
try {
  appVersion = __APP_VERSION__;
} catch {
  /* vite define may be absent */
}

type LogLevel = "error" | "warn" | "info";

interface LogEntry {
  user_email?: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  app_version?: string;
  platform?: string;
}

async function sessionInfo(): Promise<{ token: string | null; email: string | undefined }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return { token: session?.access_token ?? null, email: session?.user?.email };
  } catch {
    return { token: null, email: undefined };
  }
}

async function sendLog(entry: LogEntry): Promise<void> {
  try {
    const { token, email } = await sessionInfo();
    await fetch(`${SYNC_URL}/rest/v1/app_logs`, {
      method: "POST",
      headers: {
        apikey: SYNC_KEY,
        Authorization: `Bearer ${token ?? SYNC_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        ...entry,
        user_email: entry.user_email ?? email,
        app_version: entry.app_version || appVersion,
        platform: entry.platform || (IS_TAURI ? "desktop" : "web"),
      }),
    });
  } catch {
    // Logging must never throw or loop
  }
}

export const remoteLog = {
  error(message: string, context?: Record<string, unknown>) {
    console.error("[RemoteLog]", message, context);
    void sendLog({ level: "error", message, context });
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn("[RemoteLog]", message, context);
    void sendLog({ level: "warn", message, context });
  },
  info(message: string, context?: Record<string, unknown>) {
    void sendLog({ level: "info", message, context });
  },
};

// Global handlers — uncaught errors are logged automatically
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    remoteLog.error(`Uncaught: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    remoteLog.error(`Unhandled Promise: ${String(reason)}`, {
      stack: reason instanceof Error ? reason.stack?.substring(0, 500) : undefined,
    });
  });
}

declare const __APP_VERSION__: string;
