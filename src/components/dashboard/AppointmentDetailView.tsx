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
import { ArrowLeft, Plus, Pill, Save, Calendar, Clock, Trash2, Loader2, FileText, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { checkAppointmentConflict } from "@/lib/appointmentUtils";

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
  }, [newAppointmentForm.appointment_date, newAppointmentForm.appointment_time, newAppointmentForm.duration_minutes]);

  const fetchData = async () => {
    try {
      const [appointmentRes, patientRes, medicationsRes] = await Promise.all([
        supabase.from("appointments").select("*").eq("id", appointmentId).maybeSingle(),
        supabase.from("patients").select("id, full_name").eq("id", patientId).maybeSingle(),
        supabase.from("session_medications").select("*").eq("appointment_id", appointmentId).order("created_at"),
      ]);

      if (appointmentRes.error) throw appointmentRes.error;
      if (patientRes.error) throw patientRes.error;
      if (medicationsRes.error) throw medicationsRes.error;

      setAppointment(appointmentRes.data);
      setPatient(patientRes.data);
      setMedications(medicationsRes.data || []);
      setNotes(appointmentRes.data?.notes || "");
      setStatus(appointmentRes.data?.status || "scheduled");
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ notes, status })
        .eq("id", appointmentId);

      if (error) throw error;
      toast.success("Kaydedildi");
    } catch (error: any) {
      toast.error("Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMedication = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase.from("session_medications").insert({
        appointment_id: appointmentId,
        medication_name: medicationForm.medication_name,
        dosage: medicationForm.dosage || null,
        instructions: medicationForm.instructions || null,
      });

      if (error) throw error;

      toast.success("İlaç eklendi");
      setIsMedicationDialogOpen(false);
      setMedicationForm({ medication_name: "", dosage: "", instructions: "" });
      fetchData();
    } catch (error: any) {
      toast.error("İlaç eklenemedi");
    }
  };

  const handleDeleteMedication = async (id: string) => {
    if (!confirm("Bu ilacı silmek istediğinizden emin misiniz?")) return;

    try {
      const { error } = await supabase.from("session_medications").delete().eq("id", id);
      if (error) throw error;
      toast.success("İlaç silindi");
      fetchData();
    } catch (error: any) {
      toast.error("İlaç silinemedi");
    }
  };

  const handleCreateNewAppointment = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const appointmentDateTime = new Date(
        `${newAppointmentForm.appointment_date}T${newAppointmentForm.appointment_time}`
      );
      const durationMinutes = parseInt(newAppointmentForm.duration_minutes);

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
        doctor_id: user.id,
        patient_id: patientId,
        appointment_date: appointmentDateTime.toISOString(),
        duration_minutes: durationMinutes,
        notes: newAppointmentForm.notes || null,
      });

      if (error) throw error;

      toast.success("Yeni randevu oluşturuldu");
      setIsNewAppointmentDialogOpen(false);
      setNewAppointmentForm({
        appointment_date: "",
        appointment_time: "09:00",
        duration_minutes: "60",
        notes: "",
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

      {/* Medications Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Pill className="w-5 h-5 text-primary" />
              Reçete / İlaçlar
            </CardTitle>
            <Dialog open={isMedicationDialogOpen} onOpenChange={setIsMedicationDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  İlaç Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">İlaç Ekle</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddMedication} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="med_name">İlaç Adı *</Label>
                    <Input
                      id="med_name"
                      value={medicationForm.medication_name}
                      onChange={(e) => setMedicationForm({ ...medicationForm, medication_name: e.target.value })}
                      placeholder="Örn: Prozac"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dosage">Doz</Label>
                    <Input
                      id="dosage"
                      value={medicationForm.dosage}
                      onChange={(e) => setMedicationForm({ ...medicationForm, dosage: e.target.value })}
                      placeholder="Örn: 20mg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instructions">Kullanım Talimatı</Label>
                    <Textarea
                      id="instructions"
                      value={medicationForm.instructions}
                      onChange={(e) => setMedicationForm({ ...medicationForm, instructions: e.target.value })}
                      placeholder="Örn: Günde 1 kez, sabah aç karnına"
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
        </CardHeader>
        <CardContent>
          {medications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Henüz ilaç eklenmemiş</p>
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
                      <p className="text-sm text-muted-foreground">Doz: {med.dosage}</p>
                    )}
                    {med.instructions && (
                      <p className="text-sm text-muted-foreground mt-1">{med.instructions}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => handleDeleteMedication(med.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
