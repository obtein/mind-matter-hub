import { useEffect } from "react";

/**
 * Heartbeat + Command Listener başlatır.
 * Dashboard mount olduğunda başlar, unmount'ta durur.
 */
export const DeviceServices = () => {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      try {
        console.log("[DeviceServices] Initializing heartbeat + command listener...");
        const { startHeartbeat, stopHeartbeat } = await import("@/services/heartbeat");
        const { startCommandListener, stopCommandListener } = await import("@/services/command-listener");

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
      if (cleanup) cleanup();
    };
  }, []);

  return null;
};
