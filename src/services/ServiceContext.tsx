import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthService } from "./auth";
import type { DbService } from "./db";

interface Services {
  auth: AuthService;
  db: DbService;
}

const ServiceContext = createContext<Services | null>(null);

export function useServices(): Services {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error("Services not initialized — wrap your app in <ServiceProvider>");
  return ctx;
}

export function useAuth(): AuthService {
  return useServices().auth;
}

export function useDb(): DbService {
  return useServices().db;
}

export function ServiceProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Services | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const { LocalAuthService } = await import("./auth.local");
        const { PGliteDbService } = await import("./db.pglite");
        setServices({
          auth: new LocalAuthService(),
          db: new PGliteDbService(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Servisler başlatılamadı");
      }
    }
    init();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8">
          <p className="text-destructive font-semibold mb-2">Uygulama başlatılamadı</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            onClick={() => window.location.reload()}
          >
            Yeniden Dene
          </button>
        </div>
      </div>
    );
  }

  if (!services) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  );
}
