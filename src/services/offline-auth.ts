/**
 * Offline unlock: lets the doctor open her local (PGlite) data when Supabase Auth is
 * unreachable. After every successful online sign-in we keep a PBKDF2 verifier of the
 * password on this device. When a later sign-in fails because the server is down, the
 * password is checked against that verifier instead.
 *
 * The verifier never unlocks anything the server has rejected: a 4xx answer (wrong
 * password, rate limit) is final. Patient data on the device is not encrypted by this
 * module; it only gates the UI the same way the online sign-in does.
 */
import type { AppUser } from "./auth";
import { safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/storage";

export const PBKDF2_ITERATIONS = 600_000;
export const SIGN_IN_TIMEOUT_MS = 15_000;
const STORAGE_KEY = "psitrak_offline_credential";

export interface OfflineCredential {
  v: 1;
  userId: string;
  email: string;
  fullName?: string;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: string;
}

export interface CredentialStore {
  load(): OfflineCredential | null;
  save(credential: OfflineCredential): void;
  clear(): void;
}

export type OnlineSignIn = (email: string, password: string) => Promise<{ user: AppUser | null; error: unknown }>;

export type SignInOutcome =
  | { kind: "online"; user: AppUser }
  | { kind: "offline"; user: AppUser; error: unknown }
  | { kind: "error"; reason: "invalid" | "rejected" | "no-offline-record"; error: unknown };

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export const localCredentialStore: CredentialStore = {
  load() {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as OfflineCredential;
      return parsed?.v === 1 && parsed.userId && parsed.hash && parsed.salt ? parsed : null;
    } catch {
      return null;
    }
  },
  save(credential) {
    safeSetItem(STORAGE_KEY, JSON.stringify(credential));
  },
  clear() {
    safeRemoveItem(STORAGE_KEY);
  },
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function isOfflineUnlockSupported(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.deriveBits === "function";
}

export async function createCredential(
  user: AppUser,
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<OfflineCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return {
    v: 1,
    userId: user.id,
    email: normalizeEmail(user.email ?? ""),
    fullName: user.user_metadata?.full_name,
    salt: toBase64(salt),
    hash: toBase64(hash),
    iterations,
    createdAt: new Date().toISOString(),
  };
}

export async function verifyCredential(credential: OfflineCredential, email: string, password: string): Promise<boolean> {
  if (normalizeEmail(email) !== credential.email) return false;
  const hash = await derive(password, fromBase64(credential.salt), credential.iterations);
  return constantTimeEqual(hash, fromBase64(credential.hash));
}

export function credentialUser(credential: OfflineCredential): AppUser {
  return {
    id: credential.userId,
    email: credential.email,
    user_metadata: credential.fullName ? { full_name: credential.fullName } : undefined,
  };
}

/**
 * True when the error means "the server could not answer", not "the server said no".
 * Shapes come from @supabase/auth-js 2.90 (lib/fetch.ts handleError): network failures and
 * 502/503/504 are AuthRetryableFetchError, non-JSON bodies (Cloudflare 52x pages) are
 * AuthUnknownError, other server errors are AuthApiError with their HTTP status.
 */
export function isServerUnavailable(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof TimeoutError) return true;
  if (err instanceof TypeError) return true;
  const e = err as { name?: string; status?: number };
  if (e.name === "AuthRetryableFetchError" || e.name === "AuthUnknownError") return true;
  return typeof e.status === "number" && e.status >= 500;
}

function isInvalidCredentials(err: unknown): boolean {
  const e = err as { status?: number; code?: string };
  return e?.code === "invalid_credentials" || e?.status === 400;
}

export async function signInWithFallback(
  deps: { online: OnlineSignIn; store: CredentialStore; timeoutMs: number; iterations?: number },
  email: string,
  password: string,
): Promise<SignInOutcome> {
  let error: unknown;
  try {
    const result = await withTimeout(deps.online(email, password), deps.timeoutMs);
    if (!result.error && result.user) {
      try {
        if (isOfflineUnlockSupported()) {
          deps.store.save(await createCredential(result.user, password, deps.iterations));
        }
      } catch {
        // Enrolment is best effort; the online sign-in already succeeded.
      }
      return { kind: "online", user: result.user };
    }
    error = result.error;
  } catch (err) {
    error = err;
  }

  if (!isServerUnavailable(error)) {
    return { kind: "error", reason: isInvalidCredentials(error) ? "invalid" : "rejected", error };
  }

  const credential = deps.store.load();
  if (!credential || !isOfflineUnlockSupported() || normalizeEmail(email) !== credential.email) {
    return { kind: "error", reason: "no-offline-record", error };
  }
  if (!(await verifyCredential(credential, email, password))) {
    return { kind: "error", reason: "invalid", error };
  }
  return { kind: "offline", user: credentialUser(credential), error };
}
