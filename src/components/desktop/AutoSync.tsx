import { useEffect } from "react";
import { IS_TAURI } from "@/lib/platform";
import { remoteLog } from "@/services/remote-logger";

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
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 15000);

              try {
                const result = await Promise.race([
                  syncToSupabase(),
                  new Promise<{ success: false; message: string }>((_, reject) => {
                    controller.signal.addEventListener("abort", () =>
                      reject(new Error("Sync timeout"))
                    );
                  }),
                ]);

                if (result.success) {
                  remoteLog.info("AutoSync completed on close");
                } else {
                  // Sync başarısız — sonraki açılışta tekrar denesin
                  localStorage.setItem("psitrak_pending_sync", "true");
                  remoteLog.warn("AutoSync failed on close", { message: result.message });
                }
              } catch (err) {
                localStorage.setItem("psitrak_pending_sync", "true");
                remoteLog.warn("AutoSync timeout or error on close", { error: String(err) });
              } finally {
                clearTimeout(timeoutId);
              }
            }
          } catch {
            // Sync modülü yüklenemedi — kapanmayı engelleme
          } finally {
            // Always close the app — never hang on sync failure
            try {
              await appWindow.destroy();
            } catch {
              try { await exit(0); } catch { /* son çare */ }
            }
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
