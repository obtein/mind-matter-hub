import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/services/ServiceContext";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PatientsView } from "@/components/dashboard/PatientsView";
import { DailyScheduleView } from "@/components/dashboard/DailyScheduleView";
import { PatientDetailView } from "@/components/dashboard/PatientDetailView";
import { AppointmentDetailView } from "@/components/dashboard/AppointmentDetailView";
import { StatisticsView } from "@/components/dashboard/StatisticsView";
import { MedicationsReportView } from "@/components/dashboard/MedicationsReportView";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { AutoSync } from "@/components/desktop/AutoSync";
import { DeviceServices } from "@/components/desktop/DeviceServices";
import { setHeartbeatUser } from "@/services/heartbeat";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { initUserDb } from "@/services/pglite/init";
import { syncFromSupabase } from "@/services/supabase-sync";
import { remoteLog } from "@/services/remote-logger";
import { safeGetItem, safeRemoveItem } from "@/lib/storage";
import { toast } from "sonner";
import { Loader2, Database, RefreshCw, CheckCircle } from "lucide-react";
import psiTrakLogo from "/favicon.png";
import type { AppUser } from "@/services/auth";

export type ViewType = "schedule" | "patients" | "patient-detail" | "appointment-detail" | "statistics" | "medications";

export interface ViewState {
  type: ViewType;
  patientId?: string;
  appointmentId?: string;
}

type InitPhase = "auth" | "database" | "sync" | "ready";

const PHASE_LABELS: Record<InitPhase, string> = {
  auth: "Oturum kontrol ediliyor...",
  database: "Veritabanı hazırlanıyor...",
  sync: "Veriler senkronize ediliyor...",
  ready: "Hazır!",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [user, setUser] = useState<AppUser | null>(null);
  const [initPhase, setInitPhase] = useState<InitPhase>("auth");
  const [dbReady, setDbReady] = useState(false);
  const [viewState, setViewState] = useState<ViewState>({ type: "schedule" });
  const initStarted = useRef(false);

  // Phase 1: Auth check
  useEffect(() => {
    const sub = auth.onAuthStateChange((event, u) => {
      if (event === "SIGNED_OUT" || !u) {
        navigate("/");
      } else {
        setUser(u);
      }
    });

    auth.getSession().then(({ user: u }) => {
      if (!u) {
        navigate("/");
      } else {
        setUser(u);
        setHeartbeatUser({ id: u.id, email: u.email || "" });
      }
    });

    return () => sub.unsubscribe();
  }, [navigate]);

  // Phase 2-3: DB init + sync (runs AFTER user is set, non-blocking)
  useEffect(() => {
    if (!user || initStarted.current) return;
    initStarted.current = true;

    const initBackground = async () => {
      // Phase 2: Database init
      setInitPhase("database");
      try {
        const db = await initUserDb(user.id);

        // Ensure profile exists
        try {
          const { rows: profiles } = await db.query<{ user_id: string }>(
            "SELECT user_id FROM profiles WHERE user_id = $1", [user.id]
          );
          if (profiles.length === 0) {
            await db.query(
              "INSERT INTO profiles (user_id, full_name) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING",
              [user.id, user.user_metadata?.full_name || "Doktor"]
            );
            await db.query(
              "INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING",
              [user.id, "doctor"]
            );
          }
        } catch (profileErr) {
          console.warn("Profil oluşturma atlandı:", profileErr);
        }

        // DB ready — show dashboard UI immediately
        setDbReady(true);

        // Phase 3: Sync in background (don't block UI)
        setInitPhase("sync");
        try {
          const { rows } = await db.query<{ count: number }>("SELECT COUNT(*)::int as count FROM patients");
          const hasPendingSync = safeGetItem("psitrak_pending_sync") === "true";
          if ((rows[0]?.count ?? 0) === 0 || hasPendingSync) {
            const result = await syncFromSupabase();
            if (result.success) {
              safeRemoveItem("psitrak_pending_sync");
              toast.success(result.message);
            }
          }
        } catch (syncErr) {
          console.warn("Sync atlandı:", syncErr);
        }

        setInitPhase("ready");
      } catch (err) {
        remoteLog.error("Dashboard init failed", { error: String(err) });
        toast.error("Veritabanı başlatılamadı. Uygulamayı yeniden başlatın.");
        // Still show UI even if init fails
        setDbReady(true);
        setInitPhase("ready");
      }
    };

    initBackground();
  }, [user]);

  const navigateTo = (newState: ViewState) => {
    setViewState(newState);
  };

  // Show splash screen with progress while waiting
  if (!user || !dbReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
        <img src={psiTrakLogo} alt="PsiTrak" className="w-20 h-20" />
        <h1 className="text-2xl font-display font-bold text-foreground">PsiTrak</h1>

        <div className="flex flex-col items-center gap-3 min-w-[250px]">
          {/* Progress steps */}
          <div className="flex flex-col gap-2 text-sm w-full">
            <StepIndicator
              label="Oturum"
              done={initPhase !== "auth"}
              active={initPhase === "auth"}
            />
            <StepIndicator
              label="Veritabanı"
              done={initPhase === "sync" || initPhase === "ready"}
              active={initPhase === "database"}
            />
            <StepIndicator
              label="Senkronizasyon"
              done={initPhase === "ready"}
              active={initPhase === "sync"}
            />
          </div>

          <p className="text-muted-foreground text-xs mt-2 animate-pulse">
            {PHASE_LABELS[initPhase]}
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AutoSync />
      <DeviceServices />
      <div className="min-h-screen flex w-full bg-background">
        <OfflineIndicator />
        <DashboardSidebar
          viewState={viewState}
          setViewState={setViewState}
          user={user}
        />
        <SidebarInset className="flex-1">
          <header className="flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
            </div>
            <NotificationBell />
          </header>
          <main className="p-6 lg:p-8">
            {viewState.type === "schedule" && (
              <ErrorBoundary>
                <DailyScheduleView
                  onAppointmentSelect={(appointmentId, patientId) =>
                    navigateTo({ type: "appointment-detail", appointmentId, patientId })
                  }
                />
              </ErrorBoundary>
            )}
            {viewState.type === "patients" && (
              <ErrorBoundary>
                <PatientsView onPatientSelect={(id) => navigateTo({ type: "patient-detail", patientId: id })} />
              </ErrorBoundary>
            )}
            {viewState.type === "patient-detail" && viewState.patientId && (
              <ErrorBoundary>
                <PatientDetailView
                  patientId={viewState.patientId}
                  onBack={() => navigateTo({ type: "patients" })}
                  onAppointmentSelect={(appointmentId) => navigateTo({ type: "appointment-detail", patientId: viewState.patientId, appointmentId })}
                />
              </ErrorBoundary>
            )}
            {viewState.type === "appointment-detail" && viewState.appointmentId && viewState.patientId && (
              <ErrorBoundary>
                <AppointmentDetailView
                  appointmentId={viewState.appointmentId}
                  patientId={viewState.patientId}
                  onBack={() => navigateTo({ type: "patient-detail", patientId: viewState.patientId })}
                />
              </ErrorBoundary>
            )}
            {viewState.type === "statistics" && (
              <ErrorBoundary>
                <StatisticsView />
              </ErrorBoundary>
            )}
            {viewState.type === "medications" && (
              <ErrorBoundary>
                <MedicationsReportView />
              </ErrorBoundary>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

/** Small step indicator for splash screen */
function StepIndicator({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
      active ? "bg-primary/10 text-primary" : done ? "text-green-500" : "text-muted-foreground/50"
    }`}>
      {done ? (
        <CheckCircle className="w-4 h-4" />
      ) : active ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <div className="w-4 h-4 rounded-full border border-current" />
      )}
      <span className="font-medium">{label}</span>
    </div>
  );
}

export default Dashboard;
