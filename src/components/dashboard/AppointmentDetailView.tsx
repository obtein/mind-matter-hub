import { useState, useEffect } from "react";
import { useAuth, useDb } from "@/services/ServiceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Stethoscope, Save, Calendar, Clock, Trash2, Loader2, FileText, CheckCircle, XCircle, Bell } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { checkAppointmentConflict } from "@/lib/appointmentUtils";
import { handleError } from "@/lib/errorHandler";

interface Appointment {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  patient_id: string;
}

interface Medication {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
}

interface Patient {
  id: string;
  full_name: string;
}

interface AppointmentDetailViewProps {
  appointmentId: string;
  patientId: string;
  onBack: () => void;
}

export const AppointmentDetailView = ({ appointmentId, patientId, onBack }: AppointmentDetailViewProps) => {
  const auth = useAuth();
  const db = useDb();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [isMedicationDialogOpen, setIsMedicationDialogOpen] = useState(false);
  const [isNewAppointmentDialogOpen, setIsNewAppointmentDialogOpen] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [deleteMedicationId, setDeleteMedicationId] = useState<string | null>(null);
  const [medicationForm, setMedicationForm] = useState({
    medication_name: "",
    dosage: "",
    instructions: "",
  });
  const [newAppointmentForm, setNewAppointmentForm] = useState({
    appointment_date: "",
    appointment_time: "09:00",
    duration_minutes: "60",
    notes: "",
    reminder_time: "1_day",
  });

  useEffect(() => {
    fetchData();
  }, [appointmentId]);

  // Real-time conflict check for new appointment
  useEffect(() => {
    const checkConflict = async () => {
      if (!newAppointmentForm.appointment_date || !newAppointmentForm.appointment_time) {
        setConflictWarning(null);
        return;
      }

      setCheckingConflict(true);
      try {
        const appointmentDateTime = new Date(
          `${newAppointmentForm.appointment_date}T${newAppointmentForm.appointment_time}`
        );
        const durationMinutes = parseInt(newAppointmentForm.duration_minutes);

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
      } catch {
        // Conflict check is non-critical
      } finally {
        setCheckingConflict(false);
      }
    };

    const debounce = setTimeout(checkConflict, 300);
    return () => clearTimeout(debounce);
  }, [newAppointmentForm.appointment_date, newAppointmentForm.appointment_time, newAppointmentForm.duration_minutes]);

  const fetchData = async () => {
    try {
      const [appointmentData, patientData, medicationsData] = await Promise.all([
        db.getAppointment(appointmentId),
        db.getPatientName(patientId),
        db.getMedicationsByAppointment(appointmentId),
      ]);

      setAppointment(appointmentData);
      setPatient(patientData);
      setMedications(medicationsData || []);
      setNotes(appointmentData?.notes || "");
      setStatus(appointmentData?.status || "scheduled");
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await db.updateAppointment(appointmentId, { notes, status });
      toast.success("Kaydedildi");
    } catch (error: any) {
      toast.error("Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMedication = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!medicationForm.medication_name.trim()) {
      toast.error("Tanı boş olamaz");
      return;
    }

    try {
      await db.createMedication({
        appointment_id: appointmentId,
        medication_name: medicationForm.medication_name.trim(),
        dosage: medicationForm.dosage || null,
        instructions: medicationForm.instructions || null,
      });

      toast.success("Tanı eklendi");
      setIsMedicationDialogOpen(false);
      setMedicationForm({ medication_name: "", dosage: "", instructions: "" });
      fetchData();
    } catch (error: any) {
      toast.error("Tanı eklenemedi");
    }
  };

  const handleDeleteMedication = async (id: string) => {
    try {
      await db.deleteMedication(id);
      toast.success("Tanı silindi");
      fetchData();
    } catch {
      toast.error("Tanı silinemedi");
    }
  };

  const handleCreateNewAppointment = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const user = await auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const appointmentDateTime = new Date(
        `${newAppointmentForm.appointment_date}T${newAppointmentForm.appointment_time}`
      );
      const durationMinutes = parseInt(newAppointmentForm.duration_minutes);

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
        doctor_id: user.id,
        patient_id: patientId,
        appointment_date: appointmentDateTime.toISOString(),
        duration_minutes: durationMinutes,
        notes: newAppointmentForm.notes || null,
      });

      // Create reminder if selected
      if (newAppointmentForm.reminder_time !== "none" && appointmentData) {
        const reminderOffsets: Record<string, number> = {
          "1_hour": 60 * 60 * 1000,
          "3_hours": 3 * 60 * 60 * 1000,
          "1_day": 24 * 60 * 60 * 1000,
          "2_days": 2 * 24 * 60 * 60 * 1000,
        };

        const offset = reminderOffsets[newAppointmentForm.reminder_time] || 24 * 60 * 60 * 1000;
        const reminderTime = new Date(appointmentDateTime.getTime() - offset);

        await db.createReminder({
          appointment_id: appointmentData.id,
          reminder_type: "in_app",
          reminder_time: reminderTime.toISOString(),
        });
      }

      toast.success("Yeni randevu oluşturuldu");
      setIsNewAppointmentDialogOpen(false);
      setNewAppointmentForm({
        appointment_date: "",
        appointment_time: "09:00",
        duration_minutes: "60",
        notes: "",
        reminder_time: "1_day",
      });
    } catch (error: any) {
      toast.error("Randevu oluşturulamadı");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!appointment || !patient) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Randevu bulunamadı</p>
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
          <h1 className="text-3xl font-display font-bold text-foreground">
            {format(new Date(appointment.appointment_date), "d MMMM yyyy - HH:mm", { locale: tr })}
          </h1>
          <p className="text-muted-foreground">{patient.full_name} - Randevu Detayı</p>
        </div>
        <Dialog open={isNewAppointmentDialogOpen} onOpenChange={setIsNewAppointmentDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Calendar className="w-4 h-4 mr-2" />
              Yeni Randevu
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Yeni Randevu Oluştur</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateNewAppointment} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="apt_date">Tarih *</Label>
                  <Input
                    id="apt_date"
                    type="date"
                    value={newAppointmentForm.appointment_date}
                    onChange={(e) => setNewAppointmentForm({ ...newAppointmentForm, appointment_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apt_time">Saat *</Label>
                  <Input
                    id="apt_time"
                    type="time"
                    value={newAppointmentForm.appointment_time}
                    onChange={(e) => setNewAppointmentForm({ ...newAppointmentForm, appointment_time: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Süre</Label>
                <Select
                  value={newAppointmentForm.duration_minutes}
                  onValueChange={(value) => setNewAppointmentForm({ ...newAppointmentForm, duration_minutes: value })}
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
                <Label htmlFor="apt_reminder">Hatırlatma</Label>
                <Select
                  value={newAppointmentForm.reminder_time}
                  onValueChange={(value) => setNewAppointmentForm({ ...newAppointmentForm, reminder_time: value })}
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
                <Label htmlFor="apt_notes">Randevu Notu</Label>
                <Textarea
                  id="apt_notes"
                  value={newAppointmentForm.notes}
                  onChange={(e) => setNewAppointmentForm({ ...newAppointmentForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button type="submit" className="w-full" disabled={!!conflictWarning || checkingConflict}>
                Randevu Oluştur
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Appointment Info & Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Randevu Bilgileri
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">
                    <span className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Planlandı
                    </span>
                  </SelectItem>
                  <SelectItem value="completed">
                    <span className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      Tamamlandı
                    </span>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <span className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-600" />
                      İptal
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {format(new Date(appointment.appointment_date), "d MMMM yyyy", { locale: tr })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {format(new Date(appointment.appointment_date), "HH:mm", { locale: tr })}
            </span>
            <span>{appointment.duration_minutes} dakika</span>
          </div>
        </CardContent>
      </Card>

      {/* Notes Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Seans Notları
            </CardTitle>
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Seans notlarınızı buraya yazın... Hastanın durumu, gözlemler, tedavi planı vb."
            rows={8}
            className="resize-none"
          />
        </CardContent>
      </Card>

      {/* Diagnosis Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary" />
              Tanı
            </CardTitle>
            <div className="flex items-center gap-2">
              <Dialog open={isMedicationDialogOpen} onOpenChange={setIsMedicationDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Tanı Ekle
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">Tanı Ekle</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddMedication} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="med_name">Tanı *</Label>
                    <Input
                      id="med_name"
                      value={medicationForm.medication_name}
                      onChange={(e) => setMedicationForm({ ...medicationForm, medication_name: e.target.value })}
                      placeholder="Örn: Yaygın Anksiyete Bozukluğu"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dosage">Detay</Label>
                    <Input
                      id="dosage"
                      value={medicationForm.dosage}
                      onChange={(e) => setMedicationForm({ ...medicationForm, dosage: e.target.value })}
                      placeholder="Örn: F41.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instructions">Notlar</Label>
                    <Textarea
                      id="instructions"
                      value={medicationForm.instructions}
                      onChange={(e) => setMedicationForm({ ...medicationForm, instructions: e.target.value })}
                      placeholder="Tanı ile ilgili ek notlar..."
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Ekle
                  </Button>
                </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {medications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Stethoscope className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Henüz tanı eklenmemiş</p>
            </div>
          ) : (
            <div className="space-y-3">
              {medications.map((med) => (
                <div
                  key={med.id}
                  className="flex items-start justify-between p-4 rounded-lg bg-muted/50 border group"
                >
                  <div>
                    <p className="font-semibold">{med.medication_name}</p>
                    {med.dosage && (
                      <p className="text-sm text-muted-foreground">Detay: {med.dosage}</p>
                    )}
                    {med.instructions && (
                      <p className="text-sm text-muted-foreground mt-1">{med.instructions}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => setDeleteMedicationId(med.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <AlertDialog open={!!deleteMedicationId} onOpenChange={(open) => !open && setDeleteMedicationId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tanı Silme</AlertDialogTitle>
                <AlertDialogDescription>Bu tanıyı silmek istediğinizden emin misiniz?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { if (deleteMedicationId) handleDeleteMedication(deleteMedicationId); setDeleteMedicationId(null); }}
                >
                  Sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};
