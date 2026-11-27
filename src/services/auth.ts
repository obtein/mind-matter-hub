export interface AppUser {
  id: string;
  email: string | undefined;
  user_metadata?: { full_name?: string };
}

export type SignInFailure = "invalid" | "rejected" | "no-offline-record";

export interface SignInResult {
  error: Error | null;
  /** True when the server was unreachable and the password was checked on this device. */
  offline?: boolean;
  reason?: SignInFailure;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  getUser(): Promise<AppUser | null>;
  getSession(): Promise<{ user: AppUser | null }>;
  onAuthStateChange(
    callback: (event: string, user: AppUser | null) => void
  ): { unsubscribe: () => void };
  /** True while the user works on local data without a Supabase session. */
  isOfflineSession(): boolean;
  /** True when this device can unlock the given user offline. */
  hasOfflineAccess(userId: string): boolean;
  /** Checks the password online and stores the offline verifier for the current user. */
  enableOfflineAccess(email: string, password: string): Promise<{ error: Error | null }>;
}
