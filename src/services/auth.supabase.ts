import { supabase } from "@/integrations/supabase/client";
import type { AuthService, AppUser } from "./auth";

function mapUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata as AppUser["user_metadata"],
  };
}

export class SupabaseAuthService implements AuthService {
  async signIn(email: string, password: string): Promise<{ error: Error | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  async getUser(): Promise<AppUser | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return mapUser(user);
  }

  async getSession(): Promise<{ user: AppUser | null }> {
    const { data: { session } } = await supabase.auth.getSession();
    return { user: mapUser(session?.user ?? null) };
  }

  onAuthStateChange(
    callback: (event: string, user: AppUser | null) => void
  ): { unsubscribe: () => void } {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        callback(event, mapUser(session?.user ?? null));
      }
    );
    return { unsubscribe: () => subscription.unsubscribe() };
  }
}
