import { useState } from "react";
import { Users, Calendar, LogOut, BarChart3, Pill, RefreshCw, Loader2, Monitor } from "lucide-react";
import { IS_TAURI } from "@/lib/platform";
import { useAuth } from "@/services/ServiceContext";
import { toast } from "sonner";
import type { ViewState } from "@/pages/Dashboard";
import type { AppUser } from "@/services/auth";
import psiTrakLogo from "/favicon.png";
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
  user: AppUser;
}

const menuItems = [
  { type: "schedule" as const, label: "Günlük Randevular", icon: Calendar },
  { type: "patients" as const, label: "Hastalar", icon: Users },
  { type: "medications" as const, label: "İlaç Raporu", icon: Pill },
  { type: "statistics" as const, label: "İstatistikler", icon: BarChart3 },
];

export const DashboardSidebar = ({ viewState, setViewState, user }: DashboardSidebarProps) => {
  const auth = useAuth();
  const [syncLoading, setSyncLoading] = useState(false);

  const handleLogout = async () => {
    try {
      const { hasSyncCredentials, syncToSupabase } = await import("@/services/supabase-sync");
      if (await hasSyncCredentials()) {
        toast.info("Veriler yedekleniyor...", { id: "logout-sync" });
        await syncToSupabase();
        toast.dismiss("logout-sync");
      }
      const { closePGlite } = await import("@/services/pglite/init");
      await closePGlite();
      await auth.signOut();
      toast.success("Çıkış yapıldı");
    } catch {
      toast.error("Çıkış yapılamadı");
    }
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const { syncFromSupabase } = await import("@/services/supabase-sync");
      const result = await syncFromSupabase((p) => {
        toast.info(p.step, { id: "sync-progress" });
      });
      toast.dismiss("sync-progress");
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Senkronizasyon başarısız");
    } finally {
      setSyncLoading(false);
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
          <img src={psiTrakLogo} alt="PsiTrak Logo" className="w-10 h-10" />
          <div>
            <h1 className="font-display font-bold text-lg text-sidebar-foreground">PsiTrak</h1>
            <p className="text-xs text-sidebar-foreground/60">Hasta Takip Sistemi — v{__APP_VERSION__}</p>
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
        <SidebarMenuButton onClick={handleSync} disabled={syncLoading} className="w-full mb-2">
          {syncLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          <span>Verileri Senkronize Et</span>
        </SidebarMenuButton>
        {!IS_TAURI && (
          <SidebarMenuButton asChild className="w-full mb-2">
            <a href="/PsiTrak_0.4.2_x64_en-US.msi" download>
              <Monitor className="w-5 h-5" />
              <span>Masaüstü Uygulamayı İndir</span>
            </a>
          </SidebarMenuButton>
        )}
        <SidebarMenuButton onClick={handleLogout} className="w-full text-destructive hover:text-destructive">
          <LogOut className="w-5 h-5" />
          <span>Çıkış Yap</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
};
