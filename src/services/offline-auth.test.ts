import { describe, expect, it } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from "@supabase/auth-js";
import {
  createCredential,
  isServerUnavailable,
  signInWithFallback,
  verifyCredential,
  type CredentialStore,
  type OfflineCredential,
  type OnlineSignIn,
} from "./offline-auth";
import type { AppUser } from "./auth";

// Regression for the outage of 2026-11-27: the Supabase database stalled from 08:41 to
// 13:32 UTC, auth-js dropped the session on a refresh 500, and every sign-in hung 60-90 s
// and then failed with 504. The doctor was locked out of her local PGlite data for ~4 h.

const ITERATIONS = 1000; // production uses PBKDF2_ITERATIONS; keep tests fast
const DOCTOR: AppUser = { id: "bbc0d1f3-user", email: "doctor@example.com", user_metadata: { full_name: "Dr. Test" } };
const PASSWORD = "correct horse battery staple";

function memoryStore(initial: OfflineCredential | null = null): CredentialStore & { saved: OfflineCredential[] } {
  let current = initial;
  const saved: OfflineCredential[] = [];
  return {
    saved,
    load: () => current,
    save: (c) => {
      current = c;
      saved.push(c);
    },
    clear: () => {
      current = null;
    },
  };
}

const failWith = (error: unknown): OnlineSignIn => async () => ({ user: null, error });
const hangForever: OnlineSignIn = () => new Promise(() => {});
const succeed: OnlineSignIn = async () => ({ user: DOCTOR, error: null });

async function enrolledStore() {
  return memoryStore(await createCredential(DOCTOR, PASSWORD, ITERATIONS));
}

describe("signInWithFallback — server unavailable", () => {
  it("unlocks offline when sign-in fails with 504 (the 2026-11-27 failure)", async () => {
    const store = await enrolledStore();
    const out = await signInWithFallback(
      { online: failWith(new AuthRetryableFetchError("Gateway Timeout", 504)), store, timeoutMs: 1000 },
      DOCTOR.email!,
      PASSWORD,
    );
    expect(out.kind).toBe("offline");
    if (out.kind === "offline") {
      expect(out.user.id).toBe(DOCTOR.id);
      expect(out.user.email).toBe(DOCTOR.email);
      expect(out.user.user_metadata?.full_name).toBe("Dr. Test");
    }
  });

  it("unlocks offline when sign-in never answers (client timeout instead of a 60-90 s hang)", async () => {
    const store = await enrolledStore();
    const started = Date.now();
    const out = await signInWithFallback({ online: hangForever, store, timeoutMs: 50 }, DOCTOR.email!, PASSWORD);
    expect(out.kind).toBe("offline");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("unlocks offline on a 500 from Auth (database unreachable)", async () => {
    const store = await enrolledStore();
    const err = new AuthApiError("error finding refresh token: context canceled", 500, "unexpected_failure");
    const out = await signInWithFallback({ online: failWith(err), store, timeoutMs: 1000 }, DOCTOR.email!, PASSWORD);
    expect(out.kind).toBe("offline");
  });

  it("unlocks offline on a non-JSON gateway page (Cloudflare 522/524)", async () => {
    const store = await enrolledStore();
    const err = new AuthUnknownError("Unexpected token '<'", new SyntaxError("Unexpected token '<'"));
    const out = await signInWithFallback({ online: failWith(err), store, timeoutMs: 1000 }, DOCTOR.email!, PASSWORD);
    expect(out.kind).toBe("offline");
  });

  it("unlocks offline when the network is down (fetch throws)", async () => {
    const store = await enrolledStore();
    const online: OnlineSignIn = async () => {
      throw new TypeError("Failed to fetch");
    };
    const out = await signInWithFallback({ online, store, timeoutMs: 1000 }, DOCTOR.email!, PASSWORD);
    expect(out.kind).toBe("offline");
  });

  it("matches the email case-insensitively and ignores surrounding spaces", async () => {
    const store = await enrolledStore();
    const out = await signInWithFallback(
      { online: failWith(new AuthRetryableFetchError("down", 0)), store, timeoutMs: 1000 },
      "  Doctor@Example.COM ",
      PASSWORD,
    );
    expect(out.kind).toBe("offline");
  });

  it("rejects a wrong password while the server is down", async () => {
    const store = await enrolledStore();
    const out = await signInWithFallback(
      { online: failWith(new AuthRetryableFetchError("down", 503)), store, timeoutMs: 1000 },
      DOCTOR.email!,
      "wrong password",
    );
    expect(out).toMatchObject({ kind: "error", reason: "invalid" });
  });

  it("rejects another email while the server is down", async () => {
    const store = await enrolledStore();
    const out = await signInWithFallback(
      { online: failWith(new AuthRetryableFetchError("down", 503)), store, timeoutMs: 1000 },
      "someone.else@example.com",
      PASSWORD,
    );
    expect(out).toMatchObject({ kind: "error", reason: "no-offline-record" });
  });

  it("reports 'no-offline-record' when the device was never enrolled", async () => {
    const out = await signInWithFallback(
      { online: failWith(new AuthRetryableFetchError("down", 504)), store: memoryStore(), timeoutMs: 1000 },
      DOCTOR.email!,
      PASSWORD,
    );
    expect(out).toMatchObject({ kind: "error", reason: "no-offline-record" });
  });
});

describe("signInWithFallback — server answers", () => {
  it("never unlocks offline when the server says the credentials are wrong (400)", async () => {
    const store = await enrolledStore();
    const err = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    const out = await signInWithFallback({ online: failWith(err), store, timeoutMs: 1000 }, DOCTOR.email!, PASSWORD);
    expect(out).toMatchObject({ kind: "error", reason: "invalid" });
  });

  it("does not unlock offline on rate limiting (429)", async () => {
    const store = await enrolledStore();
    const err = new AuthApiError("Too many requests", 429, "over_request_rate_limit");
    const out = await signInWithFallback({ online: failWith(err), store, timeoutMs: 1000 }, DOCTOR.email!, PASSWORD);
    expect(out).toMatchObject({ kind: "error", reason: "rejected" });
  });

  it("signs in online and enrolls the device for offline unlock", async () => {
    const store = memoryStore();
    const out = await signInWithFallback(
      { online: succeed, store, timeoutMs: 1000, iterations: ITERATIONS },
      DOCTOR.email!,
      PASSWORD,
    );
    expect(out.kind).toBe("online");
    expect(store.saved).toHaveLength(1);
    const cred = store.saved[0];
    expect(cred.userId).toBe(DOCTOR.id);
    expect(await verifyCredential(cred, DOCTOR.email!, PASSWORD)).toBe(true);
  });

  it("replaces another user's offline record after an online sign-in", async () => {
    const other: AppUser = { id: "other-user", email: "other@example.com" };
    const store = memoryStore(await createCredential(other, "x", ITERATIONS));
    await signInWithFallback({ online: succeed, store, timeoutMs: 1000, iterations: ITERATIONS }, DOCTOR.email!, PASSWORD);
    expect(store.load()?.userId).toBe(DOCTOR.id);
  });
});

describe("offline credential", () => {
  it("never stores the password in plain text", async () => {
    const cred = await createCredential(DOCTOR, PASSWORD, ITERATIONS);
    expect(JSON.stringify(cred)).not.toContain(PASSWORD);
  });

  it("uses a fresh random salt for every record", async () => {
    const a = await createCredential(DOCTOR, PASSWORD, ITERATIONS);
    const b = await createCredential(DOCTOR, PASSWORD, ITERATIONS);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("verifies only the matching email and password", async () => {
    const cred = await createCredential(DOCTOR, PASSWORD, ITERATIONS);
    expect(await verifyCredential(cred, DOCTOR.email!, PASSWORD)).toBe(true);
    expect(await verifyCredential(cred, DOCTOR.email!, PASSWORD + "!")).toBe(false);
    expect(await verifyCredential(cred, "other@example.com", PASSWORD)).toBe(false);
  });
});

describe("isServerUnavailable", () => {
  it("treats gateway, 5xx, network and non-JSON errors as unavailable", () => {
    expect(isServerUnavailable(new AuthRetryableFetchError("x", 0))).toBe(true);
    expect(isServerUnavailable(new AuthRetryableFetchError("x", 504))).toBe(true);
    expect(isServerUnavailable(new AuthApiError("x", 500, "unexpected_failure"))).toBe(true);
    expect(isServerUnavailable(new AuthUnknownError("x", null))).toBe(true);
    expect(isServerUnavailable(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("treats answers about the request itself as available", () => {
    expect(isServerUnavailable(new AuthApiError("x", 400, "invalid_credentials"))).toBe(false);
    expect(isServerUnavailable(new AuthApiError("x", 429, "over_request_rate_limit"))).toBe(false);
    expect(isServerUnavailable(new AuthApiError("x", 422, "validation_failed"))).toBe(false);
  });
});
