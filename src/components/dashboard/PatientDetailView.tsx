import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, User, Phone, Mail, MapPin, IdCard, Calendar, FileText, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface Patient {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  emergency_phone: string | null;
  tc_identity: string | null;
  notes: string | null;
}

interface Session {
  id: string;
  session_date: string;
  notes: string | null;
  created_at: string;
}

interface PatientDetailViewProps {
  patientId: string;
  onBack: () => void;
  onSessionSelect: (sessionId: string) => void;
}

export const PatientDetailView = ({ patientId, onBack, onSessionSelect }: PatientDetailViewProps) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    session_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, [patientId]);

  const fetchData = async () => {
    try {
      const [patientRes, sessionsRes] = await Promise.all([
        supabase
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .maybeSingle(),
        supabase
          .from("sessions")
          .select("*")
          .eq("patient_id", patientId)
          .order("session_date", { ascending: false }),
      ]);

      if (patientRes.error) throw patientRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      setPatient(patientRes.data);
      setSessions(sessionsRes.data || []);
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const { error } = await supabase.from("sessions").insert({
        patient_id: patientId,
        doctor_id: user.id,
        session_date: new Date(formData.session_date).toISOString(),
        notes: formData.notes || null,
      });

      if (error) throw error;

      toast.success("Seans oluşturuldu");
      setIsDialogOpen(false);
      setFormData({
        session_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Seans oluşturulamadı");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("Bu seansı silmek istediğinizden emin misiniz?")) return;

    try {
      const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
      if (error) throw error;
      toast.success("Seans silindi");
      fetchData();
    } catch (error: any) {
      toast.error("Seans silinemedi");
    }
  };

  const calculateAge = (dateOfBirth: string | null): string => {
    if (!dateOfBirth) return "";
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age} yaş`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Hasta bulunamadı</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          Geri Dön
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold text-foreground">{patient.full_name}</h1>
          <p className="text-muted-foreground">Hasta Detayları</p>
        </div>
      </div>

      {/* Patient Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Hasta Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {patient.tc_identity && (
            <div className="flex items-center gap-3">
              <IdCard className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">TC Kimlik</p>
                <p className="font-medium">{patient.tc_identity}</p>
              </div>
            </div>
          )}
          {patient.gender && (
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Cinsiyet</p>
                <p className="font-medium capitalize">{patient.gender}</p>
              </div>
            </div>
          )}
          {patient.date_of_birth && (
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Yaş</p>
                <p className="font-medium">{calculateAge(patient.date_of_birth)}</p>
              </div>
            </div>
          )}
          {patient.phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Telefon</p>
                <p className="font-medium">{patient.phone}</p>
              </div>
            </div>
          )}
          {patient.emergency_phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Yakın Telefonu</p>
                <p className="font-medium">{patient.emergency_phone}</p>
              </div>
            </div>
          )}
          {patient.email && (
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">E-posta</p>
                <p className="font-medium">{patient.email}</p>
              </div>
            </div>
          )}
          {patient.address && (
            <div className="flex items-center gap-3 md:col-span-2 lg:col-span-3">
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Adres</p>
                <p className="font-medium">{patient.address}</p>
              </div>
            </div>
          )}
          {patient.notes && (
            <div className="md:col-span-2 lg:col-span-3 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-1">Genel Notlar</p>
              <p className="text-sm">{patient.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Seanslar</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-primary">
                <Plus className="w-4 h-4 mr-2" />
                Yeni Seans
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Yeni Seans Oluştur</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateSession} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="session_date">Seans Tarihi *</Label>
                  <Input
                    id="session_date"
                    type="date"
                    value={formData.session_date}
                    onChange={(e) => setFormData({ ...formData, session_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">İlk Notlar</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Seans hakkında ilk notlarınızı yazın..."
                    rows={4}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Seans Oluştur
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">Henüz seans eklenmemiş</p>
              <Button variant="outline" className="mt-4" onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk seansı oluşturun
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session, index) => (
              <Card
                key={session.id}
                className="group hover:shadow-medium transition-all duration-300 cursor-pointer animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => onSessionSelect(session.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">
                          {format(new Date(session.session_date), "d MMMM yyyy", { locale: tr })}
                        </p>
                        {session.notes && (
                          <p className="text-sm text-muted-foreground line-clamp-1 max-w-md">
                            {session.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={(e) => handleDeleteSession(e, session.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
