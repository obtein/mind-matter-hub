import { useState, useEffect } from "react";
import { useAuth, useDb } from "@/services/ServiceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, User, Phone, Mail, MapPin, IdCard, Calendar, FileText, Trash2, ChevronRight, Loader2, Clock, Pill, Search, X, Activity, CalendarDays, CalendarCheck, CalendarClock, Timer, Bell } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { checkAppointmentConflict } from "@/lib/appointmentUtils";
import { handleError } from "@/lib/errorHandler";

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
  const auth = useAuth();
  const db = useDb();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [medications, setMedications] = useState<MedicationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [medSearchTerm, setMedSearchTerm] = useState("");
  const [medDateFilter, setMedDateFilter] = useState<string>("");
  const [formData, setFormData] = useState({
    appointment_date: new Date().toISOString().split("T")[0],
    appointment_time: "09:00",
    duration_minutes: "60",
    notes: "",
    reminder_time: "1_day", // Options: none, 1_hour, 3_hours, 1_day, 2_days
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
          durationMinutes,
          undefined,
          db
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

  // Filter medications based on search and date
  const filteredMedications = medications.filter((med) => {
    const matchesSearch = med.medication_name.toLowerCase().includes(medSearchTerm.toLowerCase());
    
    let matchesDate = true;
    if (medDateFilter && med.appointment_date) {
      const medDate = new Date(med.appointment_date);
      const [filterYear, filterMonth] = medDateFilter.split("-").map(Number);
      matchesDate = medDate.getFullYear() === filterYear && medDate.getMonth() + 1 === filterMonth;
    }
    
    return matchesSearch && matchesDate;
  });

  const fetchData = async () => {
    try {
      const [patientData, appointmentsData] = await Promise.all([
        db.getPatient(patientId),
        db.getAppointmentsByPatient(patientId),
      ]);
      setPatient(patientData);
      setAppointments(appointmentsData || []);

      // Fetch medications for all appointments of this patient
      if (appointmentsData && appointmentsData.length > 0) {
        const appointmentIds = appointmentsData.map((a) => a.id);
        const medsData = await db.getMedicationsByAppointmentIds(appointmentIds);
        setMedications(medsData);
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
      const user = await auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const appointmentDateTime = new Date(
        `${formData.appointment_date}T${formData.appointment_time}`
      );
      const durationMinutes = parseInt(formData.duration_minutes);

      // Check for conflicts
      const { hasConflict, conflictingPatient } = await checkAppointmentConflict(
        appointmentDateTime,
        durationMinutes,
        undefined,
        db
      );

      if (hasConflict) {
        toast.error(`Bu saatte ${conflictingPatient} ile çakışan bir randevu var!`);
        return;
      }

      const appointmentData = await db.createAppointment({
        patient_id: patientId,
        doctor_id: user.id,
        appointment_date: appointmentDateTime.toISOString(),
        duration_minutes: durationMinutes,
        notes: formData.notes || null,
      });

      // Create reminder if selected
      if (formData.reminder_time !== "none" && appointmentData) {
        const reminderOffsets: Record<string, number> = {
          "1_hour": 60 * 60 * 1000,
          "3_hours": 3 * 60 * 60 * 1000,
          "1_day": 24 * 60 * 60 * 1000,
          "2_days": 2 * 24 * 60 * 60 * 1000,
        };

        const offset = reminderOffsets[formData.reminder_time] || 24 * 60 * 60 * 1000;
        const reminderTime = new Date(appointmentDateTime.getTime() - offset);

        await db.createReminder({
          appointment_id: appointmentData.id,
          reminder_type: "in_app",
          reminder_time: reminderTime.toISOString(),
        });
      }

      toast.success("Randevu oluşturuldu");
      setIsDialogOpen(false);
      setFormData({
        appointment_date: new Date().toISOString().split("T")[0],
        appointment_time: "09:00",
        duration_minutes: "60",
        notes: "",
        reminder_time: "1_day",
      });
      fetchData();
    } catch (error: any) {
      toast.error(handleError(error, "Randevu oluşturulamadı"));
    }
  };

  const handleDeleteAppointment = async (e: React.MouseEvent, appointmentId: string) => {
    e.stopPropagation();
    if (!confirm("Bu randevuyu silmek istediğinizden emin misiniz?")) return;

    try {
      await db.deleteAppointment(appointmentId);
      toast.success("Randevu silindi");
      fetchData();
    } catch (error: any) {
      toast.error(handleError(error, "Randevu silinemedi"));
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

      {/* Patient Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Hasta Özeti
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const completedAppointments = appointments.filter(a => a.status === "completed");
            const scheduledAppointments = appointments.filter(a => a.status === "scheduled" && new Date(a.appointment_date) > new Date());
            const pastAppointments = appointments.filter(a => new Date(a.appointment_date) <= new Date());
            
            // First visit date
            const firstVisit = appointments.length > 0 
              ? appointments[appointments.length - 1] 
              : null;
            
            // Last visit date (completed)
            const lastCompletedVisit = completedAppointments.length > 0 
              ? completedAppointments[0] 
              : null;
            
            // Next scheduled appointment
            const nextAppointment = scheduledAppointments.length > 0 
              ? scheduledAppointments.sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())[0]
              : null;
            
            // Last prescription date
            const lastPrescriptionDate = medications.length > 0 && medications[0].appointment_date
              ? medications[0].appointment_date 
              : null;
            
            // Visit frequency calculation (average days between visits)
            let visitFrequency = "";
            if (completedAppointments.length >= 2) {
              const sortedVisits = completedAppointments.sort((a, b) => 
                new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime()
              );
              let totalDays = 0;
              for (let i = 1; i < sortedVisits.length; i++) {
                const diff = new Date(sortedVisits[i].appointment_date).getTime() - new Date(sortedVisits[i-1].appointment_date).getTime();
                totalDays += diff / (1000 * 60 * 60 * 24);
              }
              const avgDays = Math.round(totalDays / (sortedVisits.length - 1));
              if (avgDays < 7) {
                visitFrequency = `Haftada ${Math.round(7 / avgDays)} kez`;
              } else if (avgDays < 30) {
                visitFrequency = `${Math.round(avgDays / 7)} haftada bir`;
              } else {
                visitFrequency = `${Math.round(avgDays / 30)} ayda bir`;
              }
            }

            // Treatment duration calculation
            let treatmentDuration = "";
            if (firstVisit) {
              const firstDate = new Date(firstVisit.appointment_date);
              const today = new Date();
              const diffTime = today.getTime() - firstDate.getTime();
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays < 1) {
                treatmentDuration = "Bugün başladı";
              } else if (diffDays < 7) {
                treatmentDuration = `${diffDays} gün`;
              } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                const days = diffDays % 7;
                treatmentDuration = days > 0 ? `${weeks} hafta ${days} gün` : `${weeks} hafta`;
              } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                const weeks = Math.floor((diffDays % 30) / 7);
                treatmentDuration = weeks > 0 ? `${months} ay ${weeks} hafta` : `${months} ay`;
              } else {
                const years = Math.floor(diffDays / 365);
                const months = Math.floor((diffDays % 365) / 30);
                treatmentDuration = months > 0 ? `${years} yıl ${months} ay` : `${years} yıl`;
              }
            }

            return (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <CalendarCheck className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Toplam Seans</p>
                    <p className="font-semibold">{completedAppointments.length} tamamlandı</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CalendarDays className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">İlk Geliş</p>
                    <p className="font-semibold">
                      {firstVisit 
                        ? format(new Date(firstVisit.appointment_date), "d MMMM yyyy", { locale: tr })
                        : "Henüz randevu yok"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Son Geliş</p>
                    <p className="font-semibold">
                      {lastCompletedVisit 
                        ? format(new Date(lastCompletedVisit.appointment_date), "d MMMM yyyy", { locale: tr })
                        : "Henüz tamamlanan seans yok"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <CalendarClock className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sonraki Randevu</p>
                    <p className="font-semibold">
                      {nextAppointment 
                        ? format(new Date(nextAppointment.appointment_date), "d MMMM yyyy - HH:mm", { locale: tr })
                        : "Planlanmış randevu yok"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center">
                    <Pill className="w-5 h-5 text-pink-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Son Reçete Tarihi</p>
                    <p className="font-semibold">
                      {lastPrescriptionDate 
                        ? format(new Date(lastPrescriptionDate), "d MMMM yyyy", { locale: tr })
                        : "Henüz reçete yazılmamış"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Geliş Sıklığı</p>
                    <p className="font-semibold">
                      {visitFrequency || "Hesaplanamadı"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Timer className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tedavi Süresi</p>
                    <p className="font-semibold">
                      {treatmentDuration || "Hesaplanamadı"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Medication History Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Pill className="w-5 h-5 text-primary" />
              İlaç Geçmişi
              {medications.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({filteredMedications.length}/{medications.length})
                </span>
              )}
            </CardTitle>
            {medications.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="İlaç ara..."
                    value={medSearchTerm}
                    onChange={(e) => setMedSearchTerm(e.target.value)}
                    className="pl-8 h-8 w-36 text-sm"
                  />
                </div>
                <Input
                  type="month"
                  value={medDateFilter}
                  onChange={(e) => setMedDateFilter(e.target.value)}
                  className="h-8 w-36 text-sm"
                  placeholder="Ay seç"
                />
                {(medSearchTerm || medDateFilter) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setMedSearchTerm(""); setMedDateFilter(""); }}
                    className="h-8 px-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {medications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Henüz ilaç kaydı yok</p>
            </div>
          ) : filteredMedications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Filtrelerle eşleşen ilaç bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMedications.map((med) => (
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
                  <Label htmlFor="reminder">Hatırlatma</Label>
                  <Select
                    value={formData.reminder_time}
                    onValueChange={(value) => setFormData({ ...formData, reminder_time: value })}
                  >
                    <SelectTrigger>
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Hatırlatma yok</SelectItem>
                      <SelectItem value="1_hour">1 saat önce</SelectItem>
                      <SelectItem value="3_hours">3 saat önce</SelectItem>
                      <SelectItem value="1_day">1 gün önce</SelectItem>
                      <SelectItem value="2_days">2 gün önce</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
