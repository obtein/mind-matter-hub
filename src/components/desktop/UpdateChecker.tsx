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
          toast.info(`Yeni sürüm mevcut: v${update.version}`, {
            duration: 15000,
            action: {
              label: "Güncelle",
              onClick: async () => {
                try {
                  toast.loading("Güncelleme indiriliyor...");
                  await update.downloadAndInstall();
                  const { relaunch } = await import("@tauri-apps/plugin-process");
                  toast.success("Güncelleme tamamlandı. Uygulama yeniden başlatılıyor...");
                  await relaunch();
                } catch (err: any) {
                  toast.error("Güncelleme başarısız: " + (err.message || "Bilinmeyen hata"));
                }
              },
            },
          });
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
