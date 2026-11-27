import { useEffect } from "react";
import { IS_TAURI } from "@/lib/platform";
import { toast } from "sonner";
import { safeGetItem, safeSetItem } from "@/lib/storage";
import { remoteLog } from "@/services/remote-logger";
import type { Update } from "@tauri-apps/plugin-updater";

/**
 * UpdateChecker — automatic updates for the desktop app (the doctor is a standard Windows user).
 *
 * The "PsiTrakUpdater" scheduled task can be:
 * - "secure": runs the installed exe with --apply-update as SYSTEM; the elevated process
 *   downloads and verifies the installer itself. The app only starts the task and exits.
 * - "legacy" (created before 0.7.12): runs a script from %TEMP%. Still used so updates keep
 *   working, but the installer is downloaded and verified (signature, version, URL) in Rust
 *   first. The app asks for a one-time administrator approval to replace it with the secure task.
 * - "missing": tauri-plugin-updater's downloadAndInstall (asks for administrator rights).
 *
 * A failed silent install must not turn into an exit loop: the same version is attempted at
 * most once per 30 minutes.
 */
const ATTEMPT_KEY = "psitrak_update_attempt";
const ATTEMPT_COOLDOWN_MS = 30 * 60 * 1000;
const SECURE_DISMISSED_KEY = "psitrak_secure_task_dismissed";
const SECURE_PROMPT_AT_KEY = "psitrak_secure_task_prompt_at";

type TaskStatus = "missing" | "legacy" | "secure";

function recentlyAttempted(version: string): boolean {
  try {
    const last = JSON.parse(safeGetItem(ATTEMPT_KEY) ?? "null") as { version: string; at: number } | null;
    return !!last && last.version === version && Date.now() - last.at < ATTEMPT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function recordAttempt(version: string): void {
  safeSetItem(ATTEMPT_KEY, JSON.stringify({ version, at: Date.now() }));
}

export const UpdateChecker = () => {
  useEffect(() => {
    if (!IS_TAURI) return;

    const setupAndCheck = async () => {
      const { invoke } = await import("@tauri-apps/api/core");

      let status: TaskStatus = "missing";
      try {
        status = await invoke<TaskStatus>("update_task_status");
      } catch {
        // schtasks unavailable: treat as missing
      }

      // --- Offer the secure task (one administrator approval) ---
      const dismissed = safeGetItem(SECURE_DISMISSED_KEY) === "true";
      // The legacy task is a security risk: offer the replacement once a day until it is done
      // (the doctor cannot approve it herself; an administrator must).
      const lastPrompt = Number(safeGetItem(SECURE_PROMPT_AT_KEY) ?? 0);
      const promptDue = Date.now() - lastPrompt > 24 * 60 * 60 * 1000;
      if ((status === "legacy" && promptDue) || (status === "missing" && !dismissed)) {
        safeSetItem(SECURE_PROMPT_AT_KEY, String(Date.now()));
        toast.info(
          status === "legacy"
            ? "Güncelleme ayarı yenilenmeli: bir kez yönetici onayı gerekiyor."
            : "Sessiz güncellemeler için bir seferlik yönetici onayı gerekiyor.",
          {
            id: "task-setup",
            duration: 15000,
            action: {
              label: "Şimdi Kur",
              onClick: async () => {
                try {
                  toast.loading("Yönetici onayı isteniyor...", { id: "task-setup" });
                  await invoke("register_secure_update_task");
                  status = "secure";
                  toast.success("Sessiz güncelleme güvenli şekilde kuruldu.", { id: "task-setup", duration: 4000 });
                  remoteLog.info("Secure update task registered");
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err ?? "");
                  toast.error(`Güncelleme ayarı kurulamadı. ${msg}`.trim(), { id: "task-setup", duration: 6000 });
                  remoteLog.warn("Secure update task registration failed", { error: msg.slice(0, 300) });
                }
              },
            },
            onDismiss: () => {
              if (status === "missing") safeSetItem(SECURE_DISMISSED_KEY, "true");
            },
          },
        );
      }

      // --- Check for updates after a short delay ---
      await new Promise((resolve) => setTimeout(resolve, 5000));

      let update: Update | null = null;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        update = await check();
      } catch {
        return; // endpoint unreachable — try again on the next start
      }
      if (!update) return;

      if (status !== "missing" && recentlyAttempted(update.version)) {
        // The last silent install of this version did not replace the app.
        toast.error("Güncelleme kurulamadı. Lütfen yöneticiye bildirin.", { id: "update", duration: 10000 });
        remoteLog.error("Silent update did not install", { version: update.version, status });
        return;
      }

      toast.info(`Güncelleme indiriliyor: v${update.version}...`, { duration: Infinity, id: "update" });
      try {
        if (status === "secure") {
          // The SYSTEM task downloads and verifies the installer itself.
          await invoke("trigger_secure_update");
        } else if (status === "legacy") {
          const entry = windowsEntry(update.rawJson);
          if (!entry) throw new Error("latest.json içinde Windows kaydı yok");
          await invoke<string>("download_update_msi", { downloadUrl: entry.url, signature: entry.signature });
          await invoke("trigger_update_task");
        } else {
          await fallbackDirectInstall(update);
          return;
        }
        recordAttempt(update.version);
        remoteLog.info("Silent update started", { version: update.version, status });
        toast.success("Güncelleme kuruluyor. Uygulama birkaç saniye içinde kapanacak; sonra yeniden açın.", { id: "update" });
        // Exit so the installer can replace the files (the task waits for this).
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const { exit } = await import("@tauri-apps/plugin-process");
        await exit(0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err ?? "");
        remoteLog.error("Silent update failed", { version: update.version, status, error: msg.slice(0, 300) });
        toast.error(`Sessiz güncelleme başarısız: ${msg}`.trim(), { id: "update", duration: 10000 });
      }
    };

    const timeout = setTimeout(setupAndCheck, 2000);
    return () => clearTimeout(timeout);
  }, []);

  return null;
};

/** tauri-plugin-updater's own install (verifies the signature; asks for administrator rights). */
async function fallbackDirectInstall(update: Update) {
  try {
    await update.downloadAndInstall();
    toast.success("Güncelleme tamamlandı. Uygulama yeniden başlatılıyor...", { id: "update" });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err: unknown) {
    toast.error("Güncelleme başarısız: " + (err instanceof Error ? err.message : "Bilinmeyen hata"), { id: "update" });
  }
}

/** Windows entry of latest.json (url + signature). Rust verifies both before anything runs. */
function windowsEntry(rawJson: Record<string, unknown>): { url: string; signature: string } | null {
  const platforms = rawJson.platforms as Record<string, { url?: unknown; signature?: unknown }> | undefined;
  for (const key of ["windows-x86_64-msi", "windows-x86_64"]) {
    const p = platforms?.[key];
    if (typeof p?.url === "string" && typeof p?.signature === "string") {
      return { url: p.url, signature: p.signature };
    }
  }
  return null;
}
