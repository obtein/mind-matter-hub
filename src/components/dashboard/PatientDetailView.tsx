import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, User, Phone, Mail, MapPin, IdCard, Calendar, FileText, Trash2, ChevronRight, Loader2, Clock, Pill } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { checkAppointmentConflict } from "@/lib/appointmentUtils";

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

interface Appointment {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  created_at: string;
}

interface MedicationHistory {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  appointment_date: string;
}

interface PatientDetailViewProps {
  patientId: string;
  onBack: () => void;
  onAppointmentSelect: (appointmentId: string) => void;
}

export const PatientDetailView = ({ patientId, onBack, onAppointmentSelect }: PatientDetailViewProps) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [medications, setMedications] = useState<MedicationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [formData, setFormData] = useState({
    appointment_date: new Date().toISOString().split("T")[0],
    appointment_time: "09:00",
    duration_minutes: "60",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, [patientId]);

  // Real-time conflict check
  useEffect(() => {
    const checkConflict = async () => {
      if (!formData.appointment_date || !formData.appointment_time) {
        setConflictWarning(null);
        return;
      }

      setCheckingConflict(true);
      try {
        const appointmentDateTime = new Date(
          `${formData.appointment_date}T${formData.appointment_time}`
        );
        const durationMinutes = parseInt(formData.duration_minutes);

        const { hasConflict, conflictingPatient } = await checkAppointmentConflict(
          appointmentDateTime,
          durationMinutes
        );

        if (hasConflict) {
          setConflictWarning(`Bu saatte ${conflictingPatient} ile çakışan randevu var!`);
        } else {
          setConflictWarning(null);
        }
      } catch (error) {
        console.error("Conflict check error:", error);
      } finally {
        setCheckingConflict(false);
      }
    };

    const debounce = setTimeout(checkConflict, 300);
    return () => clearTimeout(debounce);
  }, [formData.appointment_date, formData.appointment_time, formData.duration_minutes]);

  const fetchData = async () => {
    try {
      const [patientRes, appointmentsRes] = await Promise.all([
        supabase
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .maybeSingle(),
        supabase
          .from("appointments")
          .select("*")
          .eq("patient_id", patientId)
          .order("appointment_date", { ascending: false }),
      ]);

      if (patientRes.error) throw patientRes.error;
      if (appointmentsRes.error) throw appointmentsRes.error;

      setPatient(patientRes.data);
      setAppointments(appointmentsRes.data || []);

      // Fetch medications for all appointments of this patient
      if (appointmentsRes.data && appointmentsRes.data.length > 0) {
        const appointmentIds = appointmentsRes.data.map((a) => a.id);
        const { data: medsData, error: medsError } = await supabase
          .from("session_medications")
          .select(`
            id,
            medication_name,
            dosage,
            instructions,
            appointments:appointment_id (appointment_date)
          `)
          .in("appointment_id", appointmentIds)
          .order("created_at", { ascending: false });

        if (!medsError && medsData) {
          const transformedMeds: MedicationHistory[] = medsData.map((med: any) => ({
            id: med.id,
            medication_name: med.medication_name,
            dosage: med.dosage,
            instructions: med.instructions,
            appointment_date: med.appointments?.appointment_date || "",
          }));
          setMedications(transformedMeds);
        }
      }
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const appointmentDateTime = new Date(
        `${formData.appointment_date}T${formData.appointment_time}`
      );
      const durationMinutes = parseInt(formData.duration_minutes);

      // Check for conflicts
      const { hasConflict, conflictingPatient } = await checkAppointmentConflict(
        appointmentDateTime,
        durationMinutes
      );

      if (hasConflict) {
        toast.error(`Bu saatte ${conflictingPatient} ile çakışan bir randevu var!`);
        return;
      }

      const { error } = await supabase.from("appointments").insert({
        patient_id: patientId,
        doctor_id: user.id,
        appointment_date: appointmentDateTime.toISOString(),
        duration_minutes: durationMinutes,
        notes: formData.notes || null,
      });

      if (error) throw error;

      toast.success("Randevu oluşturuldu");
      setIsDialogOpen(false);
      setFormData({
        appointment_date: new Date().toISOString().split("T")[0],
        appointment_time: "09:00",
        duration_minutes: "60",
        notes: "",
      });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Randevu oluşturulamadı");
    }
  };

  const handleDeleteAppointment = async (e: React.MouseEvent, appointmentId: string) => {
    e.stopPropagation();
    if (!confirm("Bu randevuyu silmek istediğinizden emin misiniz?")) return;

    try {
      const { error } = await supabase.from("appointments").delete().eq("id", appointmentId);
      if (error) throw error;
      toast.success("Randevu silindi");
      fetchData();
    } catch (error: any) {
      toast.error("Randevu silinemedi");
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Tamamlandı";
      case "cancelled":
        return "İptal";
      default:
        return "Planlandı";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-primary/10 text-primary";
    }
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

      {/* Medication History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-primary" />
            İlaç Geçmişi
            {medications.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({medications.length} kayıt)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {medications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Henüz ilaç kaydı yok</p>
            </div>
          ) : (
            <div className="space-y-3">
              {medications.map((med) => (
                <div
                  key={med.id}
                  className="flex items-start justify-between p-4 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Pill className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{med.medication_name}</p>
                      {med.dosage && (
                        <p className="text-sm text-muted-foreground">Doz: {med.dosage}</p>
                      )}
                      {med.instructions && (
                        <p className="text-sm text-muted-foreground mt-1">{med.instructions}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {med.appointment_date
                      ? format(new Date(med.appointment_date), "d MMM yyyy", { locale: tr })
                      : "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointments Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Randevular</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-primary">
                <Plus className="w-4 h-4 mr-2" />
                Yeni Randevu
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Yeni Randevu Oluştur</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateAppointment} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="appointment_date">Tarih *</Label>
                    <Input
                      id="appointment_date"
                      type="date"
                      value={formData.appointment_date}
                      onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="appointment_time">Saat *</Label>
                    <Input
                      id="appointment_time"
                      type="time"
                      value={formData.appointment_time}
                      onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Süre</Label>
                  <Select
                    value={formData.duration_minutes}
                    onValueChange={(value) => setFormData({ ...formData, duration_minutes: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 dakika</SelectItem>
                      <SelectItem value="45">45 dakika</SelectItem>
                      <SelectItem value="60">1 saat</SelectItem>
                      <SelectItem value="90">1.5 saat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Conflict Warning */}
                {(conflictWarning || checkingConflict) && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    checkingConflict 
                      ? "bg-muted text-muted-foreground" 
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}>
                    {checkingConflict ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Kontrol ediliyor...</span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-4 h-4" />
                        <span>{conflictWarning}</span>
                      </>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="notes">Randevu Notu</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Randevu hakkında notlarınızı yazın..."
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={!!conflictWarning || checkingConflict}>
                  Randevu Oluştur
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {appointments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">Henüz randevu eklenmemiş</p>
              <Button variant="outline" className="mt-4" onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk randevuyu oluşturun
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {appointments.map((appointment, index) => (
              <Card
                key={appointment.id}
                className="group hover:shadow-medium transition-all duration-300 cursor-pointer animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => onAppointmentSelect(appointment.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">
                          {format(new Date(appointment.appointment_date), "d MMMM yyyy - HH:mm", { locale: tr })}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {appointment.duration_minutes} dk
                          </span>
                          {appointment.notes && (
                            <span className="line-clamp-1 max-w-xs">
                              {appointment.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(appointment.status)}`}>
                        {getStatusLabel(appointment.status)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={(e) => handleDeleteAppointment(e, appointment.id)}
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
