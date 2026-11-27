import { useState } from "react";
import { useAuth } from "@/services/ServiceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AppUser } from "@/services/auth";

/**
 * One-time prompt for users who are already signed in: the offline verifier can only be
 * created from the password, and a persisted session never asks for it again.
 */
export const OfflineAccessSetup = ({ user }: { user: AppUser }) => {
  const auth = useAuth();
  const [open, setOpen] = useState(() => !auth.isOfflineSession() && !auth.hasOfflineAccess(user.id));
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !user.email) return;
    setSaving(true);
    try {
      const { error } = await auth.enableOfflineAccess(user.email, password);
      if (error) {
        toast.error("Şifre doğrulanamadı. Lütfen tekrar deneyin.");
        return;
      }
      toast.success("Çevrimdışı giriş etkinleştirildi.");
      setOpen(false);
    } finally {
      setSaving(false);
      setPassword("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Çevrimdışı girişi etkinleştirin</DialogTitle>
            <DialogDescription>
              Sunucuya ulaşılamadığında da hasta kayıtlarınızı açabilmeniz için şifrenizi bir kez girin.
              Şifreniz bu bilgisayarda açık metin olarak saklanmaz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="offline-setup-password">Şifre</Label>
            <Input
              id="offline-setup-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Daha sonra
            </Button>
            <Button type="submit" disabled={saving || !password}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Etkinleştir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
