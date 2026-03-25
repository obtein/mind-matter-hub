/**
 * Simple tab lock using BroadcastChannel.
 * Prevents data corruption from concurrent DB writes across tabs.
 * Desktop app uses Tauri single-instance plugin; this is for web fallback.
 */

const LOCK_KEY = "psitrak_active_tab";
const LOCK_TIMEOUT_MS = 10000; // 10 seconds

export function acquireTabLock(): boolean {
  try {
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing) {
      const { timestamp } = JSON.parse(existing);
      // If lock is stale (tab crashed), take over
      if (Date.now() - timestamp > LOCK_TIMEOUT_MS) {
        setLock();
        return true;
      }
      return false;
    }
    setLock();
    return true;
  } catch {
    return true; // If localStorage fails, allow access
  }
}

export function refreshTabLock(): void {
  try {
    setLock();
  } catch { /* ignore */ }
}

export function releaseTabLock(): void {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch { /* ignore */ }
}

function setLock(): void {
  localStorage.setItem(LOCK_KEY, JSON.stringify({
    tabId: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
  }));
}

/**
 * Start a heartbeat to keep the lock alive.
 * Returns cleanup function.
 */
export function startTabLockHeartbeat(): () => void {
  const interval = setInterval(refreshTabLock, LOCK_TIMEOUT_MS / 2);
  window.addEventListener("beforeunload", releaseTabLock);
  return () => {
    clearInterval(interval);
    window.removeEventListener("beforeunload", releaseTabLock);
    releaseTabLock();
  };
}
