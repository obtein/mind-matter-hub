import { useEffect } from "react";
import { IS_TAURI } from "@/lib/platform";

export const AutoSync = () => {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { exit } = await import("@tauri-apps/plugin-process");
        const appWindow = getCurrentWindow();

        unlisten = await appWindow.onCloseRequested(async (event) => {
          event.preventDefault();

          try {
            const { hasSyncCredentials, syncToSupabase } = await import("@/services/supabase-sync");

            if (await hasSyncCredentials()) {
              const syncPromise = syncToSupabase().catch(() => {});
              const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 10000));
              await Promise.race([syncPromise, timeoutPromise]);
            }
          } catch {
            // Sync hatası kapanmayı engellememeli
          }

          // Her durumda uygulamayı kapat
          try {
            await appWindow.destroy();
          } catch {
            try { await exit(0); } catch { /* son çare */ }
          }
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
