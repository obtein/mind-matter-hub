import { useEffect } from "react";

/**
 * Heartbeat + Command Listener başlatır.
 * Dashboard mount olduğunda başlar, unmount'ta durur.
 */
export const DeviceServices = () => {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { startHeartbeat, stopHeartbeat } = await import("@/services/heartbeat");
      const { startCommandListener, stopCommandListener } = await import("@/services/command-listener");

      startHeartbeat();
      startCommandListener();

      cleanup = () => {
        stopHeartbeat();
        stopCommandListener();
      };
    };

    init();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return null;
};
