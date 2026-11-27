import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthRetryableFetchError } from "@supabase/auth-js";

// Integration guard for the outage of 2026-11-27: with Supabase down, the service must
// unlock offline, keep the offline session against Supabase's "no session" events, never
// hang on getSession/signOut, and leave offline mode once the server answers again.

const h = vi.hoisted(() => {
  type Cb = (event: string, session: unknown) => void;
  const listeners = new Set<Cb>();
  const auth = {
    signInWithPassword: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn((cb: Cb) => {
      listeners.add(cb);
      cb("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
  };
  const fire = (event: string, session: unknown) => listeners.forEach((cb) => cb(event, session));
  return { auth, listeners, fire };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: h.auth } }));
vi.mock("./remote-logger", () => ({ remoteLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { SupabaseAuthService } from "./auth.supabase";

const USER = { id: "bbc0d1f3-user", email: "doctor@example.com", user_metadata: { full_name: "Dr. Test" } };
const PASSWORD = "correct horse battery staple";
const down = () => ({ data: { user: null, session: null }, error: new AuthRetryableFetchError("Gateway Timeout", 504) });
const up = () => ({ data: { user: USER, session: { user: USER } }, error: null });

function installLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  vi.stubGlobal("localStorage", storage);
  return map;
}

async function enrolledOfflineService() {
  const service = new SupabaseAuthService();
  h.auth.signInWithPassword.mockResolvedValueOnce(up());
  expect((await service.signIn(USER.email, PASSWORD)).error).toBeNull();
  h.auth.signInWithPassword.mockResolvedValue(down());
  const result = await service.signIn(USER.email, PASSWORD);
  return { service, result };
}

describe("SupabaseAuthService during a Supabase outage", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installLocalStorage();
    h.listeners.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("signs in offline with the stored verifier and reports the local user", async () => {
    const { service, result } = await enrolledOfflineService();
    expect(result).toMatchObject({ error: null, offline: true });
    expect(service.isOfflineSession()).toBe(true);
    expect((await service.getSession()).user?.id).toBe(USER.id);
    expect(storage.get("psitrak_pending_sync")).toBe("true");
  });

  it("ignores Supabase's 'no session' events while offline (no kick back to login)", async () => {
    const { service } = await enrolledOfflineService();
    const seen: string[] = [];
    service.onAuthStateChange((event) => seen.push(event)); // INITIAL_SESSION null fires here
    h.fire("SIGNED_OUT", null); // what auth-js emits after a refresh 500
    expect(seen).toEqual([]);
    expect(service.isOfflineSession()).toBe(true);
  });

  it("returns no user instead of hanging when getSession never answers", async () => {
    vi.useFakeTimers();
    const service = new SupabaseAuthService();
    h.auth.getSession.mockReturnValue(new Promise(() => {}));
    const pending = service.getSession();
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toEqual({ user: null });
  });

  it("tells listeners SIGNED_OUT when an online sign-out fails on the server", async () => {
    // auth-js returns the error and emits nothing; the dashboard would stay with a closed DB.
    const service = new SupabaseAuthService();
    storage.set("sb-vhdhwnvfomwzauvqozxo-auth-token", "{session}");
    const seen: string[] = [];
    service.onAuthStateChange((event) => seen.push(event));
    h.auth.signOut.mockResolvedValue({ error: new AuthRetryableFetchError("Gateway Timeout", 504) });
    await service.signOut();
    expect(storage.has("sb-vhdhwnvfomwzauvqozxo-auth-token")).toBe(false);
    expect(seen).toContain("SIGNED_OUT");
  });

  it("discards a reconnect that the server answers after the user signed out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { service } = await enrolledOfflineService();
    let answer: (v: unknown) => void = () => {};
    h.auth.signInWithPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = (v) => {
            storage.set("sb-vhdhwnvfomwzauvqozxo-auth-token", "{late session}"); // auth-js _saveSession
            resolve(v);
          };
        }),
    );
    await vi.advanceTimersByTimeAsync(60_000); // reconnect request starts and hangs
    h.auth.signOut.mockResolvedValue({ error: null });
    await service.signOut();
    answer(up()); // the stalled server finally answers
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.has("sb-vhdhwnvfomwzauvqozxo-auth-token")).toBe(false);
    expect(service.isOfflineSession()).toBe(false);
  });

  it("signs out locally when Supabase cannot be reached and tells listeners", async () => {
    const { service } = await enrolledOfflineService();
    storage.set("sb-vhdhwnvfomwzauvqozxo-auth-token", "{stale}");
    const seen: string[] = [];
    service.onAuthStateChange((event) => seen.push(event));
    vi.useFakeTimers();
    h.auth.signOut.mockReturnValue(new Promise(() => {}));
    const pending = service.signOut();
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(service.isOfflineSession()).toBe(false);
    expect(storage.has("sb-vhdhwnvfomwzauvqozxo-auth-token")).toBe(false);
    expect(seen).toContain("SIGNED_OUT");
  });

  it("leaves offline mode once the server accepts the password again", async () => {
    // Fake the timers before going offline: the retry interval is created at that moment.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { service } = await enrolledOfflineService();
    const seen: Array<[string, string | undefined]> = [];
    service.onAuthStateChange((event, u) => seen.push([event, u?.id]));
    expect(service.isOfflineSession()).toBe(true);
    h.auth.signInWithPassword.mockImplementation(async () => {
      h.fire("SIGNED_IN", { user: USER });
      return up();
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.isOfflineSession()).toBe(false);
    expect(seen).toContainEqual(["SIGNED_IN", USER.id]);
  });

  it("does not unlock offline when the device was never enrolled", async () => {
    const service = new SupabaseAuthService();
    h.auth.signInWithPassword.mockResolvedValue(down());
    const result = await service.signIn(USER.email, PASSWORD);
    expect(result).toMatchObject({ reason: "no-offline-record" });
    expect(result.error).toBeInstanceOf(Error);
    expect(service.isOfflineSession()).toBe(false);
  });
});
