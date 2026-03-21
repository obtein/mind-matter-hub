import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";

type SyncState = "idle" | "syncing" | "done";

export const MigrationButton = () => {
  const [state, setState] = useState<SyncState>("idle");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  const handleSync = async () => {
    setState("syncing");
    setProgress(0);
    setStep("Sunucuya baglaniliyor...");

    try {
      const { syncFromSupabase } = await import("@/services/supabase-sync");

      const result = await syncFromSupabase((p) => {
        setProgress(p.percent);
        setStep(p.step);
      });

      if (result.success) {
        setResultMessage(result.message);
        setState("done");
        toast.success("Senkronizasyon tamamlandi!");
      } else {
        toast.error(result.message);
        setState("idle");
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error(error.message || "Senkronizasyon sirasinda hata olustu");
      setState("idle");
    }
  };

  const handleDone = () => {
    setState("idle");
    setResultMessage("");
    window.location.reload();
  };

  return (
    <>
      <SidebarMenuButton onClick={handleSync} disabled={state === "syncing"} className="w-full">
        {state === "syncing" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        <span className="text-xs">Verileri Senkronize Et</span>
      </SidebarMenuButton>

      {/* Progress Dialog */}
      <Dialog open={state === "syncing"} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Senkronizasyon</DialogTitle>
            <DialogDescription>
              Veriler sunucudan indiriliyor...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">{step}</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {progress}% tamamlandi
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Done Dialog */}
      <Dialog open={state === "done"} onOpenChange={(open) => !open && handleDone()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Senkronizasyon Tamamlandi</DialogTitle>
            <DialogDescription>{resultMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleDone}>Tamam</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
