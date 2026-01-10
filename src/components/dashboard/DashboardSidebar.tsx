import { Brain, Users, Calendar, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ViewState } from "@/pages/Dashboard";
import type { User } from "@supabase/supabase-js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface DashboardSidebarProps {
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
  user: User;
}

const menuItems = [
  { type: "schedule" as const, label: "Günlük Randevular", icon: Calendar },
  { type: "patients" as const, label: "Hastalar", icon: Users },
];

export const DashboardSidebar = ({ viewState, setViewState, user }: DashboardSidebarProps) => {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Çıkış yapıldı");
    } catch (error) {
      toast.error("Çıkış yapılamadı");
    }
  };

  const isActive = (type: string) => {
    if (type === "patients") {
      return viewState.type === "patients" || viewState.type === "patient-detail" || viewState.type === "appointment-detail";
    }
    return viewState.type === type;
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Brain className="w-6 h-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-sidebar-foreground">PsiTrack</h1>
            <p className="text-xs text-sidebar-foreground/60">Hasta Takip Sistemi</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">Menü</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.type}>
                  <SidebarMenuButton
                    onClick={() => setViewState({ type: item.type })}
                    isActive={isActive(item.type)}
                    className="w-full"
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sm font-medium text-sidebar-foreground">
              {user.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user.user_metadata?.full_name || "Doktor"}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
          </div>
        </div>
        <SidebarMenuButton onClick={handleLogout} className="w-full text-destructive hover:text-destructive">
          <LogOut className="w-5 h-5" />
          <span>Çıkış Yap</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
};
