import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PatientsView } from "@/components/dashboard/PatientsView";
import { CalendarView } from "@/components/dashboard/CalendarView";
import { NotesView } from "@/components/dashboard/NotesView";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import type { User } from "@supabase/supabase-js";

export type ViewType = "patients" | "calendar" | "notes";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewType>("patients");

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
          activeView={activeView} 
          setActiveView={setActiveView}
          user={user}
        />
        <SidebarInset className="flex-1">
          <main className="p-6 lg:p-8">
            {activeView === "patients" && <PatientsView />}
            {activeView === "calendar" && <CalendarView />}
            {activeView === "notes" && <NotesView />}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
