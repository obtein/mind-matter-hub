import { getPGlite } from "./pglite/init";
import type { AuthService, AppUser } from "./auth";
import { safeGetItem, safeSetItem, safeRemoveItem } from "@/lib/storage";

type AuthCallback = (event: string, user: AppUser | null) => void;

const SESSION_KEY = "psitrak_local_session";

let listeners: AuthCallback[] = [];

function getStoredUserId(): string | null {
  return safeGetItem(SESSION_KEY);
}

function storeUserId(userId: string | null): void {
  if (userId) {
    safeSetItem(SESSION_KEY, userId);
  } else {
    safeRemoveItem(SESSION_KEY);
  }
}

function emit(event: string, user: AppUser | null) {
  for (const cb of listeners) {
    try { cb(event, user); } catch { /* ignore */ }
  }
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class LocalAuthService implements AuthService {
  async signIn(email: string, password: string): Promise<{ error: Error | null }> {
    try {
      const db = await getPGlite();
      const hash = await hashPassword(password);

      // Try to find existing user
      const { rows } = await db.query<{ id: string; email: string; full_name: string }>(
        "SELECT id, email, full_name FROM local_users WHERE email = $1 AND password_hash = $2",
        [email, hash]
      );

      if (rows.length === 0) {
        // Check if there are NO users at all (first-run: auto-create)
        const countResult = await db.query("SELECT COUNT(*)::int as count FROM local_users");
        const count = (countResult.rows[0] as Record<string, unknown> | undefined)?.count ?? 0;

        if (count === 0) {
          // First run — create the user automatically
          const insertResult = await db.query<{ id: string; email: string; full_name: string }>(
            `INSERT INTO local_users (email, password_hash, full_name)
             VALUES ($1, $2, $3)
             RETURNING id, email, full_name`,
            [email, hash, "Doktor"]
          );

          const newUser = insertResult.rows[0];
          if (newUser) {
            // Create profile and role
            await db.query(
              "INSERT INTO profiles (user_id, full_name) VALUES ($1, $2)",
              [newUser.id.toString(), newUser.full_name]
            );
            await db.query(
              "INSERT INTO user_roles (user_id, role) VALUES ($1, 'doctor')",
              [newUser.id.toString()]
            );

            const user: AppUser = {
              id: newUser.id.toString(),
              email: newUser.email,
              user_metadata: { full_name: newUser.full_name },
            };
            storeUserId(user.id);
            emit("SIGNED_IN", user);
            return { error: null };
          }
        }

        return { error: new Error("Geçersiz e-posta veya şifre") };
      }

      const row = rows[0];
      const user: AppUser = {
        id: row.id.toString(),
        email: row.email,
        user_metadata: { full_name: row.full_name },
      };
      storeUserId(user.id);
      emit("SIGNED_IN", user);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Giriş hatası") };
    }
  }

  async signOut(): Promise<void> {
    storeUserId(null);
    emit("SIGNED_OUT", null);
  }

  async getUser(): Promise<AppUser | null> {
    const userId = getStoredUserId();
    if (!userId) return null;

    const db = await getPGlite();
    const { rows } = await db.query<{ id: string; email: string; full_name: string }>(
      "SELECT id, email, full_name FROM local_users WHERE id = $1",
      [userId]
    );

    if (rows.length === 0) {
      storeUserId(null);
      return null;
    }

    return {
      id: rows[0].id,
      email: rows[0].email,
      user_metadata: { full_name: rows[0].full_name },
    };
  }

  async getSession(): Promise<{ user: AppUser | null }> {
    const user = await this.getUser();
    return { user };
  }

  onAuthStateChange(
    callback: (event: string, user: AppUser | null) => void
  ): { unsubscribe: () => void } {
    listeners.push(callback);
    return {
      unsubscribe: () => {
        listeners = listeners.filter((cb) => cb !== callback);
      },
    };
  }
}
