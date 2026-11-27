import { supabase } from "@/integrations/supabase/client";
import type { AuthService, AppUser, SignInResult } from "./auth";
import {
  SIGN_IN_TIMEOUT_MS,
  TimeoutError,
  createCredential,
  isOfflineUnlockSupported,
  localCredentialStore,
  signInWithFallback,
  withTimeout,
  type OnlineSignIn,
} from "./offline-auth";
import { safeSetItem } from "@/lib/storage";
import { remoteLog } from "./remote-logger";

const SESSION_TIMEOUT_MS = 15_000;
const SIGN_OUT_TIMEOUT_MS = 5_000;
const RECONNECT_INTERVAL_MS = 60_000;

type Listener = (event: string, user: AppUser | null) => void;

function mapUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata as AppUser["user_metadata"],
  };
}

const onlineSignIn: OnlineSignIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: mapUser(data?.user ?? null), error };
};

/** Removes the stored Supabase session without a network call (the server may be down). */
function clearLocalSupabaseSession(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token/.test(key)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

export class SupabaseAuthService implements AuthService {
  private offlineUser: AppUser | null = null;
  private reconnectCredentials: { email: string; password: string } | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectInFlight: Promise<unknown> | null = null;
  /** Bumped on every sign-out so a late reconnect answer cannot sign the user back in. */
  private generation = 0;
  private listeners = new Set<Listener>();

  async signIn(email: string, password: string): Promise<SignInResult> {
    const outcome = await signInWithFallback(
      { online: onlineSignIn, store: localCredentialStore, timeoutMs: SIGN_IN_TIMEOUT_MS },
      email,
      password,
    );

    if (outcome.kind === "online") {
      this.leaveOffline();
      return { error: null };
    }

    if (outcome.kind === "offline") {
      this.enterOffline(outcome.user, email, password);
      remoteLog.warn("Offline sign-in: Supabase Auth unreachable", { error: String(outcome.error ?? "") });
      return { error: null, offline: true };
    }

    const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error ?? "sign-in failed");
    return { error: new Error(message), reason: outcome.reason };
  }

  async signOut(): Promise<void> {
    this.generation++;
    this.leaveOffline();
    try {
      const { error } = await withTimeout(supabase.auth.signOut(), SIGN_OUT_TIMEOUT_MS);
      if (error) clearLocalSupabaseSession();
    } catch {
      clearLocalSupabaseSession();
    }
    // auth-js emits nothing when its server call fails; the dashboard navigates on this event.
    this.emit("SIGNED_OUT", null);
  }

  async getUser(): Promise<AppUser | null> {
    if (this.offlineUser) return this.offlineUser;
    const { data: { user } } = await supabase.auth.getUser();
    return mapUser(user);
  }

  async getSession(): Promise<{ user: AppUser | null }> {
    if (this.offlineUser) return { user: this.offlineUser };
    try {
      // getSession() refreshes an expired token over the network and has no timeout of its own.
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
      return { user: mapUser(session?.user ?? null) };
    } catch (err) {
      if (err instanceof TimeoutError) remoteLog.warn("getSession timed out", { ms: SESSION_TIMEOUT_MS });
      return { user: null };
    }
  }

  onAuthStateChange(callback: Listener): { unsubscribe: () => void } {
    this.listeners.add(callback);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = mapUser(session?.user ?? null);
      // While offline, Supabase reports "no session" (INITIAL_SESSION, failed refresh).
      // That must not end the offline session.
      if (this.offlineUser && !user) return;
      if (this.offlineUser && user) this.leaveOffline();
      callback(event, user);
    });
    return {
      unsubscribe: () => {
        this.listeners.delete(callback);
        subscription.unsubscribe();
      },
    };
  }

  isOfflineSession(): boolean {
    return this.offlineUser !== null;
  }

  hasOfflineAccess(userId: string): boolean {
    if (!isOfflineUnlockSupported()) return true; // nothing to set up on this device
    return localCredentialStore.load()?.userId === userId;
  }

  async enableOfflineAccess(email: string, password: string): Promise<{ error: Error | null }> {
    try {
      const { user, error } = await withTimeout(onlineSignIn(email, password), SIGN_IN_TIMEOUT_MS);
      if (error || !user) {
        return { error: error instanceof Error ? error : new Error("Şifre doğrulanamadı") };
      }
      localCredentialStore.save(await createCredential(user, password));
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  private emit(event: string, user: AppUser | null): void {
    this.listeners.forEach((listener) => listener(event, user));
  }

  private enterOffline(user: AppUser, email: string, password: string): void {
    this.offlineUser = user;
    this.reconnectCredentials = { email, password };
    // Local changes made offline must reach Supabase on the next successful sync.
    safeSetItem("psitrak_pending_sync", "true");
    if (!this.reconnectTimer) {
      this.reconnectTimer = setInterval(() => void this.tryReconnect(), RECONNECT_INTERVAL_MS);
    }
  }

  private leaveOffline(): void {
    this.offlineUser = null;
    this.reconnectCredentials = null;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async tryReconnect(): Promise<void> {
    const creds = this.reconnectCredentials;
    // A request from an earlier tick may still be running after our timeout gave up on it.
    if (!creds || this.reconnectInFlight) return;
    const generation = this.generation;
    const request = onlineSignIn(creds.email, creds.password);
    this.reconnectInFlight = request;
    request.finally(() => {
      this.reconnectInFlight = null;
    }).catch(() => {});
    // If the user signs out before the request settles, discard the session it creates.
    request.then(({ user, error }) => {
      if (user && !error && generation !== this.generation) clearLocalSupabaseSession();
    }).catch(() => {});

    try {
      const { user, error } = await withTimeout(request, SIGN_IN_TIMEOUT_MS);
      if (generation !== this.generation) return;
      if (user && !error) {
        // Supabase emits SIGNED_IN; the listener above leaves offline mode for us.
        this.leaveOffline();
        remoteLog.info("Offline session reconnected to Supabase");
      } else if (error && (error as { status?: number }).status === 400) {
        // The server rejects this password now (changed elsewhere): stop retrying, keep working locally.
        this.reconnectCredentials = null;
        if (this.reconnectTimer) {
          clearInterval(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        remoteLog.warn("Offline reconnect rejected by server; retries stopped");
      }
    } catch {
      // Still unreachable; try again on the next tick.
    }
  }
}
