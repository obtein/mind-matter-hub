/**
 * Heartbeat servisi — Her 2 dakikada bir Supabase'e cihaz durumu gönderir.
 * Master (admin) uygulaması bu verileri okuyarak slave'leri izler.
 */
import { LocalAuthService } from "@/services/auth.local";

const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 dakika
let intervalId: ReturnType<typeof setInterval> | null = null;

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function sendHeartbeat(): Promise<void> {
  try {
    const auth = new LocalAuthService();
    const user = await auth.getUser();
    if (!user) return;

    const payload = {
      user_id: String(user.id),
      user_email: user.email,
      app_version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
      platform: "__TAURI__" in window ? "desktop" : "web",
      os_info: navigator.userAgent.substring(0, 200),
      last_seen_at: new Date().toISOString(),
    };

    // Upsert: user_id unique constraint üzerinden merge
    const res = await fetch(`${SYNC_URL}/rest/v1/device_heartbeats?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: SYNC_KEY,
        Authorization: `Bearer ${SYNC_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("Heartbeat response:", res.status, errText);
    }
  } catch (err) {
    console.warn("Heartbeat failed:", err);
  }
}

export function startHeartbeat(): void {
  if (intervalId) return;
  sendHeartbeat(); // İlk heartbeat hemen
  intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

export function stopHeartbeat(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

declare const __APP_VERSION__: string;
