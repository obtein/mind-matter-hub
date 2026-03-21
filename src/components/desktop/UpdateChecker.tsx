import { useEffect } from "react";
import { IS_TAURI } from "@/lib/platform";
import { toast } from "sonner";

export const UpdateChecker = () => {
  useEffect(() => {
    if (!IS_TAURI) return;

    const checkForUpdate = async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();

        if (update) {
          // Sessiz güncelleme — otomatik indir ve kur
          toast.info(`Güncelleme indiriliyor: v${update.version}...`, { duration: Infinity, id: "update" });
          try {
            await update.downloadAndInstall();
            toast.success("Güncelleme tamamlandı. Uygulama yeniden başlatılıyor...", { id: "update" });
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          } catch (err: any) {
            toast.error("Güncelleme başarısız: " + (err.message || "Bilinmeyen hata"), { id: "update" });
          }
        }
      } catch {
        // Silently fail — updater endpoint might not be configured yet
      }
    };

    const timeout = setTimeout(checkForUpdate, 5000);
    return () => clearTimeout(timeout);
  }, []);

  return null;
};
