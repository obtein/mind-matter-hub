import { useEffect } from "react";
import { IS_TAURI } from "@/lib/platform";
import { toast } from "sonner";

/**
 * UpdateChecker - Handles automatic updates for the desktop (Tauri) app.
 *
 * Strategy:
 * 1. On first launch, check if a Windows Scheduled Task ("PsiTrakUpdater") exists.
 * 2. If not, show a toast asking the user to grant one-time admin permission to create it.
 * 3. When an update is available:
 *    a. If scheduled task exists → download MSI to temp, trigger the task for silent install (no UAC).
 *    b. If scheduled task does NOT exist (fallback) → use tauri-plugin-updater's downloadAndInstall()
 *       which will trigger a UAC prompt each time.
 */
export const UpdateChecker = () => {
  useEffect(() => {
    if (!IS_TAURI) return;

    const setupAndCheck = async () => {
      const { invoke } = await import("@tauri-apps/api/core");

      // --- Step 1: Ensure the scheduled task is registered ---
      let taskExists = false;
      try {
        taskExists = await invoke<boolean>("check_update_task_exists");
      } catch {
        // schtasks check failed, assume not present
      }

      if (!taskExists) {
        // Show a one-time toast asking for admin permission
        toast.info(
          "PsiTrak ilk kurulum: Sessiz güncellemeler için bir seferlik yönetici izni gerekiyor.",
          {
            id: "task-setup",
            duration: 15000,
            action: {
              label: "İzin Ver",
              onClick: async () => {
                try {
                  toast.loading("Yönetici izni isteniyor...", { id: "task-setup" });
                  const result = await invoke<string>("register_update_task");
                  toast.success("Sessiz güncelleme görevi oluşturuldu: " + result, {
                    id: "task-setup",
                  });
                } catch (err: any) {
                  toast.error(
                    "Görev oluşturulamadı. Güncellemeler UAC isteyecek. Hata: " +
                      (err?.message || err || "Bilinmeyen hata"),
                    { id: "task-setup" }
                  );
                }
              },
            },
          }
        );
      }

      // --- Step 2: Check for updates after a short delay ---
      await new Promise((resolve) => setTimeout(resolve, 5000));

      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();

        if (!update) return;

        toast.info(`Güncelleme indiriliyor: v${update.version}...`, {
          duration: Infinity,
          id: "update",
        });

        // Re-check task existence (user may have just created it)
        let useScheduledTask = false;
        try {
          useScheduledTask = await invoke<boolean>("check_update_task_exists");
        } catch {
          // fallback to direct install
        }

        // Extract download URL from rawJson (Tauri updater v2 latest.json format)
        // The rawJson contains the full endpoint response, with platform entries having a "url" field
        const downloadUrl = extractDownloadUrl(update.rawJson);

        if (useScheduledTask && downloadUrl) {
          // --- Path A: Silent install via scheduled task (no UAC) ---
          try {
            // Download the MSI to a temp folder via Rust
            const msiPath = await invoke<string>("download_update_msi", {
              downloadUrl,
            });

            toast.info("MSI indirildi, sessiz kurulum başlatılıyor...", { id: "update" });

            // Trigger the scheduled task to install the MSI
            await invoke<string>("trigger_update_task", { msiPath });

            toast.success(
              "Güncelleme başlatıldı. Uygulama birkaç saniye içinde yeniden başlayacak...",
              { id: "update" }
            );

            // Wait a bit for msiexec to start, then exit the app so it can be replaced
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const { exit } = await import("@tauri-apps/plugin-process");
            await exit(0);
          } catch (err: any) {
            // If scheduled task approach fails, fall back to direct install
            console.error("Scheduled task update failed, falling back:", err);
            toast.info("Sessiz kurulum başarısız, standart güncelleme deneniyor...", {
              id: "update",
            });
            await fallbackDirectInstall(update);
          }
        } else {
          // --- Path B: Fallback - direct install via tauri-plugin-updater (will trigger UAC) ---
          await fallbackDirectInstall(update);
        }
      } catch {
        // Silently fail — updater endpoint might not be configured yet
      }
    };

    const timeout = setTimeout(setupAndCheck, 2000);
    return () => clearTimeout(timeout);
  }, []);

  return null;
};

/**
 * Fallback: use tauri-plugin-updater's downloadAndInstall() which triggers UAC each time.
 */
async function fallbackDirectInstall(update: any) {
  try {
    await update.downloadAndInstall();
    toast.success("Güncelleme tamamlandı. Uygulama yeniden başlatılıyor...", { id: "update" });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err: any) {
    toast.error("Güncelleme başarısız: " + (err?.message || "Bilinmeyen hata"), { id: "update" });
  }
}

/**
 * Extract the MSI download URL from the Tauri updater rawJson response.
 * The latest.json format for Tauri v2 can be:
 *   - { url: "...", version: "...", ... }                   (single platform)
 *   - { platforms: { "windows-x86_64": { url: "..." } } }  (multi-platform)
 */
function extractDownloadUrl(rawJson: Record<string, unknown>): string | null {
  try {
    // Direct url field
    if (typeof rawJson.url === "string") {
      return rawJson.url;
    }
    // Multi-platform format
    if (rawJson.platforms && typeof rawJson.platforms === "object") {
      const platforms = rawJson.platforms as Record<string, any>;
      // Try common Windows target keys
      for (const key of ["windows-x86_64", "x86_64-pc-windows-msvc"]) {
        if (platforms[key]?.url) {
          return platforms[key].url as string;
        }
      }
      // Fallback: pick the first platform with a url
      for (const key of Object.keys(platforms)) {
        if (key.toLowerCase().includes("windows") && platforms[key]?.url) {
          return platforms[key].url as string;
        }
      }
    }
  } catch {
    // Extraction failed
  }
  return null;
}
