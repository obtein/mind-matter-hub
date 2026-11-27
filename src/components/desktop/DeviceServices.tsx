import { useEffect } from "react";

/**
 * Heartbeat + Command Listener başlatır.
 * Dashboard mount olduğunda başlar, unmount'ta durur.
 */
export const DeviceServices = () => {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let unmounted = false;

    const init = async () => {
      try {
        console.log("[DeviceServices] Initializing heartbeat + command listener...");
        const { startHeartbeat, stopHeartbeat } = await import("@/services/heartbeat");
        const { startCommandListener, stopCommandListener } = await import("@/services/command-listener");

        // Unmounted while the modules were loading (quick logout): do not start anything.
        if (unmounted) return;
        startHeartbeat();
        startCommandListener();
        console.log("[DeviceServices] Started successfully");

        cleanup = () => {
          stopHeartbeat();
          stopCommandListener();
        };
      } catch (err) {
        console.error("[DeviceServices] Failed to initialize:", err);
      }
    };

    init();

    return () => {
      unmounted = true;
      if (cleanup) cleanup();
    };
  }, []);

  return null;
};
