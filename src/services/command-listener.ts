/**
 * Command listener — polls admin_commands every 30 seconds and executes pending
 * commands addressed to this user (or to everyone). Requests carry the user's own
 * session token; row-level security decides what this user may read and update.
 * Ordering rules (mark before run, run once) live in command-processor.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { localHandledStore, processCommands, type AdminCommand, type ExecuteResult } from "./command-processor";

const CHECK_INTERVAL = 30 * 1000; // 30 seconds
const REQUEST_TIMEOUT_MS = 15_000;
let intervalId: ReturnType<typeof setInterval> | null = null;
let checking = false;

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function checkCommands(): Promise<void> {
  if (checking) return;
  checking = true;
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
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return;

    const commands: AdminCommand[] = await res.json();

    await processCommands(commands, {
      now: () => Date.now(),
      handled: localHandledStore,
      patch: async (id, body) => {
        try {
          const r = await fetch(`${SYNC_URL}/rest/v1/admin_commands?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          return r.ok;
        } catch {
          return false;
        }
      },
      execute: executeCommand,
    });
  } catch (err) {
    console.warn("Command check failed:", err);
  } finally {
    checking = false;
  }
}

async function executeCommand(cmd: AdminCommand): Promise<ExecuteResult> {
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
        return "ok";
      } catch {
        console.warn("Force update failed — not in Tauri or no update available");
        return "failed";
      }
    }

    case "show_message": {
      const message = typeof cmd.payload?.message === "string" ? cmd.payload.message : "Yöneticiden mesaj";
      toast.info(message.slice(0, 500), { duration: 10000 });
      return "ok";
    }

    case "restart": {
      try {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch {
        window.location.reload();
      }
      return "ok";
    }

    default:
      console.warn("Unknown command:", cmd.command_type);
      return "unknown";
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
