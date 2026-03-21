import { useEffect } from "react";
import { IS_TAURI } from "@/lib/platform";

export const AutoSync = () => {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();

        unlisten = await appWindow.onCloseRequested(async (event) => {
          event.preventDefault();

          try {
            const { hasSyncCredentials, syncToSupabase } = await import("@/services/supabase-sync");

            if (await hasSyncCredentials()) {
              // Max 15 saniye bekle, sonra yine de kapat
              const syncPromise = syncToSupabase();
              const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 15000));
              await Promise.race([syncPromise, timeoutPromise]);
            }
          } catch (err) {
            console.error("AutoSync error:", err);
          }

          // Her durumda kapat
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
