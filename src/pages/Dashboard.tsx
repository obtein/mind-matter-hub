import { useEffect, useState } from "react";
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
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import type { AppUser } from "@/services/auth";

export type ViewType = "schedule" | "patients" | "patient-detail" | "appointment-detail" | "statistics" | "medications";

export interface ViewState {
  type: ViewType;
  patientId?: string;
  appointmentId?: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<ViewState>({ type: "schedule" });

  useEffect(() => {
    const sub = auth.onAuthStateChange((event, user) => {
      if (event === "SIGNED_OUT" || !user) {
        navigate("/");
      } else {
        setUser(user);
      }
      setLoading(false);
    });

    auth.getSession().then(({ user }) => {
      if (!user) {
        navigate("/");
      } else {
        setUser(user);
      }
      setLoading(false);
    });

    return () => sub.unsubscribe();
  }, [navigate]);

  const navigateTo = (newState: ViewState) => {
    setViewState(newState);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Yükleniyor...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <AutoSync />
      <div className="min-h-screen flex w-full bg-background">
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
              <DailyScheduleView 
                onAppointmentSelect={(appointmentId, patientId) => 
                  navigateTo({ type: "appointment-detail", appointmentId, patientId })
                }
              />
            )}
            {viewState.type === "patients" && <PatientsView onPatientSelect={(id) => navigateTo({ type: "patient-detail", patientId: id })} />}
            {viewState.type === "patient-detail" && viewState.patientId && (
              <PatientDetailView 
                patientId={viewState.patientId}
                onBack={() => navigateTo({ type: "patients" })}
                onAppointmentSelect={(appointmentId) => navigateTo({ type: "appointment-detail", patientId: viewState.patientId, appointmentId })}
              />
            )}
            {viewState.type === "appointment-detail" && viewState.appointmentId && viewState.patientId && (
              <AppointmentDetailView
                appointmentId={viewState.appointmentId}
                patientId={viewState.patientId}
                onBack={() => navigateTo({ type: "patient-detail", patientId: viewState.patientId })}
              />
            )}
            {viewState.type === "statistics" && <StatisticsView />}
            {viewState.type === "medications" && <MedicationsReportView />}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
