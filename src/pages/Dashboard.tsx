import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PatientsView } from "@/components/dashboard/PatientsView";
import { DailyScheduleView } from "@/components/dashboard/DailyScheduleView";
import { PatientDetailView } from "@/components/dashboard/PatientDetailView";
import { AppointmentDetailView } from "@/components/dashboard/AppointmentDetailView";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import type { User } from "@supabase/supabase-js";

export type ViewType = "schedule" | "patients" | "patient-detail" | "appointment-detail";

export interface ViewState {
  type: ViewType;
  patientId?: string;
  appointmentId?: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<ViewState>({ type: "schedule" });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          navigate("/");
        } else {
          setUser(session.user);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/");
      } else {
        setUser(session.user);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar 
          viewState={viewState}
          setViewState={setViewState}
          user={user}
        />
        <SidebarInset className="flex-1">
          <main className="p-6 lg:p-8">
            {viewState.type === "schedule" && <DailyScheduleView />}
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
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
