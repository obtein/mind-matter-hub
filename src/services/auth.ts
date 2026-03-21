export interface AppUser {
  id: string;
  email: string | undefined;
  user_metadata?: { full_name?: string };
}

export interface AuthService {
  signIn(email: string, password: string): Promise<{ error: Error | null }>;
  signOut(): Promise<void>;
  getUser(): Promise<AppUser | null>;
  getSession(): Promise<{ user: AppUser | null }>;
  onAuthStateChange(
    callback: (event: string, user: AppUser | null) => void
  ): { unsubscribe: () => void };
}
