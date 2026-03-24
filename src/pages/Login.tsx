import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/services/ServiceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Heart, Shield, Loader2 } from "lucide-react";
import psiTrakLogo from "/favicon.png";
import { syncFromSupabase } from "@/services/supabase-sync";
import { getPGlite } from "@/services/pglite/init";

const Login = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginData, setLoginData] = useState({ email: "", password: "" });

  // Auto login: mevcut oturum varsa direkt dashboard'a yönlendir
  useEffect(() => {
    auth.getSession().then(async ({ user }) => {
      if (user) {
        await ensureLocalData();
        navigate("/dashboard", { replace: true });
      } else {
        setCheckingSession(false);
      }
    }).catch(() => setCheckingSession(false));
  }, [auth, navigate]);

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // İlk girişte lokal DB boşsa Supabase'den veri çek
  const ensureLocalData = async () => {
    try {
      const db = await getPGlite();

      // Supabase user bilgisini al
      const user = await auth.getUser();
      if (!user) return;

      // Lokal profil yoksa oluştur
      const { rows: profiles } = await db.query<{ user_id: string }>(
        "SELECT user_id FROM profiles WHERE user_id = $1", [user.id]
      );
      if (profiles.length === 0) {
        await db.query(
          "INSERT INTO profiles (user_id, full_name) VALUES ($1, $2) ON CONFLICT(user_id) DO NOTHING",
          [user.id, user.user_metadata?.full_name || "Doktor"]
        );
        await db.query(
          "INSERT INTO user_roles (user_id, role) VALUES ($1, 'doctor') ON CONFLICT(user_id, role) DO NOTHING",
          [user.id]
        );
      }

      // Hasta yoksa Supabase'den çek
      const { rows } = await db.query<{ count: number }>("SELECT COUNT(*)::int as count FROM patients");
      if ((rows[0]?.count ?? 0) === 0) {
        toast.info("Veriler senkronize ediliyor...");
        const result = await syncFromSupabase();
        if (result.success) {
          toast.success(result.message);
        }
      }
    } catch (err) {
      console.error("İlk sync hatası:", err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await auth.signIn(loginData.email, loginData.password);

      if (error) {
        toast.error("Giriş bilgileri hatalı. Lütfen e-posta ve şifrenizi kontrol edin.");
        return;
      }

      toast.success("Giriş başarılı!");
      await ensureLocalData();
      navigate("/dashboard");
    } catch {
      toast.error("Giriş yapılamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 flex flex-col justify-center items-center text-primary-foreground p-12 w-full">
          <div className="flex items-center gap-3 mb-8">
            <img src={psiTrakLogo} alt="PsiTrak Logo" className="w-12 h-12" />
            <h1 className="text-4xl font-display font-bold">PsiTrak</h1>
          </div>
          <p className="text-xl text-center max-w-md opacity-90 mb-12">
            Psikiyatrist Hasta Takip Sistemi
          </p>
          
          <div className="space-y-6 max-w-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Hasta Takibi</h3>
                <p className="text-sm opacity-80">Hastalarınızı kolayca yönetin ve notlarınızı kaydedin</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Güvenli & Gizli</h3>
                <p className="text-sm opacity-80">Tüm verileriniz şifrelenerek güvenle saklanır</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <img src={psiTrakLogo} alt="PsiTrak Logo" className="w-8 h-8" />
            <h1 className="text-2xl font-display font-bold text-foreground">PsiTrak</h1>
          </div>

          <Card className="border-0 shadow-medium animate-scale-in">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-display">Hoş Geldiniz</CardTitle>
              <CardDescription>Devam etmek için giriş yapın</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-posta</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="ornek@email.com"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Şifre</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full shadow-primary" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Giriş yapılıyor...
                    </>
                  ) : (
                    "Giriş Yap"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;
