import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { MigrationProgress } from "@/services/migration";

const SUPABASE_URL = "https://dzpgcihnpdnuvfrneygx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6cGdjaWhucGRudXZmcm5leWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMTQzMTEsImV4cCI6MjA4MzU5MDMxMX0.sKP5RbLMDSssaQfiLg2QFdq0aAutDoiMBPlJymQfMO0";

type MigrationState = "idle" | "credentials" | "migrating" | "done";

export const MigrationButton = () => {
  const [state, setState] = useState<MigrationState>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [resultMessage, setResultMessage] = useState("");

  const handleStart = () => {
    setState("credentials");
    setEmail("");
    setPassword("");
    setProgress(null);
    setResultMessage("");
  };

  const handleMigrate = async () => {
    if (!email || !password) {
      toast.error("E-posta ve sifre gerekli");
      return;
    }

    setState("migrating");
    setProgress({ step: "PsiTrak'a giris yapiliyor...", current: 0, total: 8 });

    try {
      const { authenticateSupabase, fetchSupabaseData, migrateFromSupabase } =
        await import("@/services/migration");

      // Step 1: Authenticate
      const accessToken = await authenticateSupabase(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        email,
        password
      );

      setProgress({ step: "Veriler PsiTrak'dan aliniyor...", current: 0, total: 8 });

      // Step 2: Fetch all data
      const data = await fetchSupabaseData(SUPABASE_URL, accessToken, SUPABASE_ANON_KEY);

      // Step 3: Run migration
      const result = await migrateFromSupabase(data, (p) => setProgress(p));

      if (result.success) {
        setResultMessage(result.message);
        setState("done");
        toast.success("Veri aktarimi basarili!");
      } else {
        toast.error(result.message);
        setState("credentials");
      }
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Aktarim sirasinda hata olustu");
      setState("credentials");
    }
  };

  const handleClose = () => {
    setState("idle");
    setProgress(null);
    setResultMessage("");
  };

  const handleDone = () => {
    handleClose();
    window.location.reload();
  };

  const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <>
      <SidebarMenuButton onClick={handleStart} className="w-full">
        <Database className="w-4 h-4" />
        <span className="text-xs">PsiTrak'dan Aktar</span>
      </SidebarMenuButton>

      {/* Credentials Dialog */}
      <Dialog open={state === "credentials"} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>PsiTrak Veri Aktarimi</DialogTitle>
            <DialogDescription>
              PsiTrak hesabiniza giris yaparak verilerinizi masaustu uygulamasina aktarin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sb-email">PsiTrak E-posta</Label>
              <Input
                id="sb-email"
                type="email"
                placeholder="ornek@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-password">PsiTrak Sifre</Label>
              <Input
                id="sb-password"
                type="password"
                placeholder="Sifreniz"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMigrate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Iptal
            </Button>
            <Button onClick={handleMigrate} disabled={!email || !password}>
              Aktarimi Baslat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog */}
      <Dialog open={state === "migrating"} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Veri Aktarimi Devam Ediyor</DialogTitle>
            <DialogDescription>
              Lutfen bekleyin, veriler aktariliyor...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">{progress?.step || "Hazirlaniyor..."}</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {progressPercent}% tamamlandi
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Done Dialog */}
      <Dialog open={state === "done"} onOpenChange={(open) => !open && handleDone()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aktarim Tamamlandi</DialogTitle>
            <DialogDescription>{resultMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleDone}>Tamam ve Yenile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
