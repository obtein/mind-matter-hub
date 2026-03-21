import { useState } from "react";
import { Users, Calendar, LogOut, BarChart3, Pill, Download, Upload, Loader2 } from "lucide-react";
import { useAuth } from "@/services/ServiceContext";
import { toast } from "sonner";
import type { ViewState } from "@/pages/Dashboard";
import type { AppUser } from "@/services/auth";
import { IS_TAURI } from "@/lib/platform";
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
  const [backupLoading, setBackupLoading] = useState(false);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success("Çıkış yapıldı");
    } catch (error) {
      toast.error("Çıkış yapılamadı");
    }
  };

  const handleExport = async () => {
    const password = prompt("Yedek dosyası için şifre belirleyin:");
    if (!password || password.length < 4) {
      if (password !== null) toast.error("Şifre en az 4 karakter olmalıdır");
      return;
    }
    setBackupLoading(true);
    try {
      const { downloadBackup } = await import("@/services/backup");
      await downloadBackup(password);
      toast.success("Yedek başarıyla oluşturuldu");
    } catch (error: any) {
      toast.error(error.message || "Yedek oluşturulamadı");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImport = async () => {
    if (!confirm("Mevcut tüm veriler silinecek ve yedekten geri yüklenecek. Devam etmek istiyor musunuz?")) return;
    const password = prompt("Yedek dosyasının şifresini girin:");
    if (!password) return;
    setBackupLoading(true);
    try {
      const { uploadAndRestoreBackup } = await import("@/services/backup");
      await uploadAndRestoreBackup(password);
      toast.success("Veriler başarıyla geri yüklendi. Sayfa yenileniyor...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error(error.message || "Geri yükleme başarısız");
    } finally {
      setBackupLoading(false);
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
        {IS_TAURI && (
          <div className="flex gap-2 mb-3">
            <SidebarMenuButton
              onClick={handleExport}
              disabled={backupLoading}
              className="flex-1"
            >
              {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="text-xs">Yedekle</span>
            </SidebarMenuButton>
            <SidebarMenuButton
              onClick={handleImport}
              disabled={backupLoading}
              className="flex-1"
            >
              <Upload className="w-4 h-4" />
              <span className="text-xs">Geri Yükle</span>
            </SidebarMenuButton>
          </div>
        )}
        <SidebarMenuButton onClick={handleLogout} className="w-full text-destructive hover:text-destructive">
          <LogOut className="w-5 h-5" />
          <span>Çıkış Yap</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
};
