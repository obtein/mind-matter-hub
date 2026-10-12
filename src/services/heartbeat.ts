/**
 * Heartbeat — every 2 minutes the device reports its version and platform to Supabase.
 * The admin app reads device_heartbeats to see which devices are online.
 * Requests carry the user's own session token so row-level security can scope them.
 */
import { IS_TAURI } from "@/lib/platform";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes
let intervalId: ReturnType<typeof setInterval> | null = null;

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Set by Dashboard after login; independent of the local database.
let currentUser: { id: string; email: string } | null = null;

export function setHeartbeatUser(user: { id: string; email: string } | null): void {
  currentUser = user;
}

async function sendHeartbeat(): Promise<void> {
  try {
    if (!currentUser) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const payload = {
      user_id: String(currentUser.id),
      user_email: currentUser.email,
      app_version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
      platform: IS_TAURI ? "desktop" : "web",
      os_info: navigator.userAgent.substring(0, 200),
      last_seen_at: new Date().toISOString(),
    };

    // Upsert on the unique user_id
    const res = await fetch(`${SYNC_URL}/rest/v1/device_heartbeats?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: SYNC_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
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
  // First heartbeat after 3 seconds (user must be set by then)
  setTimeout(sendHeartbeat, 3000);
  intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

export function stopHeartbeat(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

declare const __APP_VERSION__: string;
