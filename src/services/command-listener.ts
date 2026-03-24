/**
 * Command Listener — Master'dan gelen komutları dinler ve çalıştırır.
 * Her 30 saniyede bir pending komut kontrol eder.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CHECK_INTERVAL = 30 * 1000; // 30 saniye
let intervalId: ReturnType<typeof setInterval> | null = null;

interface AdminCommand {
  id: string;
  target_user_id: string | null;
  command_type: string;
  payload: Record<string, unknown>;
  status: string;
}

async function checkCommands(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const SYNC_URL = import.meta.env.VITE_SUPABASE_URL;
    const SYNC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { data: { session } } = await supabase.auth.getSession();

    const headers = {
      apikey: SYNC_KEY,
      Authorization: `Bearer ${session?.access_token || SYNC_KEY}`,
      "Content-Type": "application/json",
    };

    // Pending komutları çek (bu kullanıcıya veya herkese)
    const url = `${SYNC_URL}/rest/v1/admin_commands?status=eq.pending&or=(target_user_id.eq.${user.id},target_user_id.is.null)&order=created_at.asc`;
    const res = await fetch(url, { headers });
    if (!res.ok) return;

    const commands: AdminCommand[] = await res.json();

    for (const cmd of commands) {
      await executeCommand(cmd);

      // Komutu executed olarak işaretle
      await fetch(`${SYNC_URL}/rest/v1/admin_commands?id=eq.${cmd.id}`, {
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
    case "force_update":
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

    case "show_message":
      const message = (cmd.payload as any)?.message || "Yöneticiden mesaj";
      toast.info(message, { duration: 10000 });
      break;

    case "restart":
      try {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch {
        window.location.reload();
      }
      break;

    default:
      console.warn("Unknown command:", cmd.command_type);
  }
}

export function startCommandListener(): void {
  if (intervalId) return;
  checkCommands(); // İlk kontrol hemen
  intervalId = setInterval(checkCommands, CHECK_INTERVAL);
}

export function stopCommandListener(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
