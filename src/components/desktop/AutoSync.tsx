import { useEffect } from "react";
import { IS_TAURI } from "@/lib/platform";
import { toast } from "sonner";

export const AutoSync = () => {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();

        unlisten = await appWindow.onCloseRequested(async (event) => {
          // Kapanmayı durdur, sync yap, sonra kapat
          event.preventDefault();

          const { hasSyncCredentials, syncToSupabase } = await import("@/services/supabase-sync");
          const hasCredentials = await hasSyncCredentials();

          if (hasCredentials) {
            toast.info("Veriler yedekleniyor...", { id: "auto-sync", duration: Infinity });

            const result = await syncToSupabase();

            if (result.success) {
              toast.success("Yedekleme tamamlandi", { id: "auto-sync", duration: 1000 });
            } else {
              console.error("Sync failed:", result.message);
            }
          }

          // Sync bitti (veya credentials yok), uygulamayı kapat
          await appWindow.destroy();
        });
      } catch (err) {
        console.error("AutoSync setup error:", err);
      }
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return null;
};
