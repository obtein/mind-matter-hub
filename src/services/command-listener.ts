/**
 * Command listener — polls admin_commands every 30 seconds and executes pending
 * commands addressed to this user (or to everyone). Requests carry the user's own
 * session token; row-level security decides what this user may read and update.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CHECK_INTERVAL = 30 * 1000; // 30 seconds
let intervalId: ReturnType<typeof setInterval> | null = null;

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface AdminCommand {
  id: string;
  target_user_id: string | null;
  command_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

const MAX_COMMAND_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function checkCommands(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const userId = session.user.id;

    const headers = {
      apikey: SYNC_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };

    const url =
      `${SYNC_URL}/rest/v1/admin_commands?status=eq.pending` +
      `&or=(target_user_id.eq.${encodeURIComponent(userId)},target_user_id.is.null)` +
      `&order=created_at.asc`;
    const res = await fetch(url, { headers });
    if (!res.ok) return;

    const commands: AdminCommand[] = await res.json();

    for (const cmd of commands) {
      if (cmd.status !== "pending") continue;

      const commandAge = Date.now() - new Date(cmd.created_at).getTime();
      if (commandAge > MAX_COMMAND_AGE_MS) {
        await fetch(`${SYNC_URL}/rest/v1/admin_commands?id=eq.${encodeURIComponent(cmd.id)}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({ status: "expired" }),
        });
        continue;
      }

      await executeCommand(cmd);

      await fetch(`${SYNC_URL}/rest/v1/admin_commands?id=eq.${encodeURIComponent(cmd.id)}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "executed", executed_at: new Date().toISOString() }),
      });
    }
  } catch (err) {
    console.warn("Command check failed:", err);
  }
}

async function executeCommand(cmd: AdminCommand): Promise<void> {
  switch (cmd.command_type) {
    case "force_update": {
      toast.info("Yönetici güncelleme isteği gönderdi. Güncelleme kontrol ediliyor...");
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          toast.info("Güncelleme indiriliyor...");
          await update.downloadAndInstall();
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
        }
      } catch {
        console.warn("Force update failed — not in Tauri or no update available");
      }
      break;
    }

    case "show_message": {
      const message = typeof cmd.payload?.message === "string" ? cmd.payload.message : "Yöneticiden mesaj";
      toast.info(message, { duration: 10000 });
      break;
    }

    case "restart": {
      try {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch {
        window.location.reload();
      }
      break;
    }

    default:
      console.warn("Unknown command:", cmd.command_type);
  }
}

export function startCommandListener(): void {
  if (intervalId) return;
  void checkCommands();
  intervalId = setInterval(checkCommands, CHECK_INTERVAL);
}

export function stopCommandListener(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
