import { useState, useEffect } from "react";
import { Users, Calendar, LogOut, BarChart3, Pill, Download, Upload, Loader2, Monitor, Database } from "lucide-react";
import { useAuth, useDb } from "@/services/ServiceContext";
import { toast } from "sonner";
import type { ViewState } from "@/pages/Dashboard";
import type { AppUser } from "@/services/auth";
import { IS_TAURI } from "@/lib/platform";
import { MigrationButton } from "@/components/migration/MigrationButton";
import psiTrakLogo from "/favicon.png";
import { PasswordDialog } from "@/components/ui/password-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const LAST_BACKUP_KEY = "psitrak_last_backup";
const BACKUP_REMINDER_DAYS = 7;

const menuItems = [
  { type: "schedule" as const, label: "Günlük Randevular", icon: Calendar },
  { type: "patients" as const, label: "Hastalar", icon: Users },
  { type: "medications" as const, label: "İlaç Raporu", icon: Pill },
  { type: "statistics" as const, label: "İstatistikler", icon: BarChart3 },
];

export const DashboardSidebar = ({ viewState, setViewState, user }: DashboardSidebarProps) => {
  const auth = useAuth();
  const db = useDb();
  const [backupLoading, setBackupLoading] = useState(false);
  const [webBackupLoading, setWebBackupLoading] = useState(false);
  const [exportPasswordOpen, setExportPasswordOpen] = useState(false);
  const [importPasswordOpen, setImportPasswordOpen] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);

  // Backup reminder check
  useEffect(() => {
    if (!IS_TAURI) return;
    try {
      const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
      if (!lastBackup) {
        toast.warning("Henüz hiç yedek alınmamış. Verilerinizi korumak için yedek alın.", { duration: 8000 });
        return;
      }
      const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= BACKUP_REMINDER_DAYS) {
        toast.warning(`Son yedekten bu yana ${daysSince} gün geçti. Yedek almanız önerilir.`, { duration: 8000 });
      }
    } catch { /* ignore */ }
  }, []);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success("Çıkış yapıldı");
    } catch {
      toast.error("Çıkış yapılamadı");
    }
  };

  const handleExport = async (password: string) => {
    setBackupLoading(true);
    try {
      const { downloadBackup } = await import("@/services/backup");
      await downloadBackup(password);
      localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
      toast.success("Yedek başarıyla oluşturuldu");
    } catch (error: any) {
      toast.error(error.message || "Yedek oluşturulamadı");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImport = async (password: string) => {
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

  const handleWebBackup = async () => {
    setWebBackupLoading(true);
    try {
      const [patients, appointments, medications, notifications] = await Promise.all([
        db.getPatients(),
        db.getAppointmentsForStats(),
        db.getAllMedicationsWithDetails(),
        db.getNotifications(1000),
      ]);

      const backupData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        tables: { patients, appointments, medications, notifications },
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `psitrak_yedek_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Yedek dosyası indirildi");
    } catch (error: any) {
      toast.error("Yedek oluşturulamadı: " + (error.message || "Bilinmeyen hata"));
    } finally {
      setWebBackupLoading(false);
    }
  };

  const isActive = (type: string) => {
    if (type === "patients") {
      return viewState.type === "patients" || viewState.type === "patient-detail" || viewState.type === "appointment-detail";
    }
    return viewState.type === type;
  };

  return (
    <>
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
                onClick={() => setExportPasswordOpen(true)}
                disabled={backupLoading}
                className="flex-1"
              >
                {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="text-xs">Yedekle</span>
              </SidebarMenuButton>
              <SidebarMenuButton
                onClick={() => setImportConfirmOpen(true)}
                disabled={backupLoading}
                className="flex-1"
              >
                <Upload className="w-4 h-4" />
                <span className="text-xs">Geri Yükle</span>
              </SidebarMenuButton>
            </div>
          )}
          {!IS_TAURI && (
            <div className="flex flex-col gap-2 mb-3">
              <SidebarMenuButton
                onClick={handleWebBackup}
                disabled={webBackupLoading}
                className="w-full"
              >
                {webBackupLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                <span>Verileri Yedekle (JSON)</span>
              </SidebarMenuButton>
              <SidebarMenuButton asChild className="w-full">
                <a href="/downloads/PsiTrak_0.1.0_x64_en-US.msi" download>
                  <Monitor className="w-5 h-5" />
                  <span>Masaüstü Uygulamayı İndir</span>
                </a>
              </SidebarMenuButton>
            </div>
          )}
          <MigrationButton />
          <SidebarMenuButton onClick={handleLogout} className="w-full text-destructive hover:text-destructive">
            <LogOut className="w-5 h-5" />
            <span>Çıkış Yap</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>

      {/* Export password dialog */}
      <PasswordDialog
        open={exportPasswordOpen}
        onOpenChange={setExportPasswordOpen}
        title="Yedek Şifresi"
        description="Yedek dosyasını korumak için bir şifre belirleyin. Bu şifreyi unutmayın, geri yükleme sırasında gerekecektir."
        minLength={8}
        onConfirm={handleExport}
      />

      {/* Import confirm dialog */}
      <AlertDialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Geri Yükleme Onayı</AlertDialogTitle>
            <AlertDialogDescription>
              Mevcut tüm veriler silinecek ve yedekten geri yüklenecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setImportConfirmOpen(false);
                setImportPasswordOpen(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Devam Et
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import password dialog */}
      <PasswordDialog
        open={importPasswordOpen}
        onOpenChange={setImportPasswordOpen}
        title="Yedek Şifresi"
        description="Yedek dosyasının şifresini girin."
        minLength={1}
        onConfirm={handleImport}
      />
    </>
  );
};
