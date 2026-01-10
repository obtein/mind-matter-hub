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
import { ArrowLeft, Plus, Pill, Save, Calendar, Clock, Trash2, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface Session {
  id: string;
  session_date: string;
  notes: string | null;
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

interface SessionDetailViewProps {
  sessionId: string;
  patientId: string;
  onBack: () => void;
}

export const SessionDetailView = ({ sessionId, patientId, onBack }: SessionDetailViewProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [isMedicationDialogOpen, setIsMedicationDialogOpen] = useState(false);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [medicationForm, setMedicationForm] = useState({
    medication_name: "",
    dosage: "",
    instructions: "",
  });
  const [appointmentForm, setAppointmentForm] = useState({
    appointment_date: "",
    appointment_time: "09:00",
    duration_minutes: "60",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const [sessionRes, patientRes, medicationsRes, patientsRes] = await Promise.all([
        supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle(),
        supabase.from("patients").select("id, full_name").eq("id", patientId).maybeSingle(),
        supabase.from("session_medications").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("patients").select("id, full_name").order("full_name"),
      ]);

      if (sessionRes.error) throw sessionRes.error;
      if (patientRes.error) throw patientRes.error;
      if (medicationsRes.error) throw medicationsRes.error;

      setSession(sessionRes.data);
      setPatient(patientRes.data);
      setMedications(medicationsRes.data || []);
      setPatients(patientsRes.data || []);
      setNotes(sessionRes.data?.notes || "");
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ notes })
        .eq("id", sessionId);

      if (error) throw error;
      toast.success("Notlar kaydedildi");
    } catch (error: any) {
      toast.error("Notlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMedication = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase.from("session_medications").insert({
        session_id: sessionId,
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

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const appointmentDateTime = new Date(
        `${appointmentForm.appointment_date}T${appointmentForm.appointment_time}`
      );

      const { error } = await supabase.from("appointments").insert({
        doctor_id: user.id,
        patient_id: patientId,
        appointment_date: appointmentDateTime.toISOString(),
        duration_minutes: parseInt(appointmentForm.duration_minutes),
        notes: appointmentForm.notes || null,
      });

      if (error) throw error;

      toast.success("Randevu oluşturuldu");
      setIsAppointmentDialogOpen(false);
      setAppointmentForm({
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

  if (!session || !patient) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Seans bulunamadı</p>
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
            {format(new Date(session.session_date), "d MMMM yyyy", { locale: tr })}
          </h1>
          <p className="text-muted-foreground">{patient.full_name} - Seans Detayı</p>
        </div>
        <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Calendar className="w-4 h-4 mr-2" />
              Randevu Oluştur
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Yeni Randevu Oluştur</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="apt_date">Tarih *</Label>
                  <Input
                    id="apt_date"
                    type="date"
                    value={appointmentForm.appointment_date}
                    onChange={(e) => setAppointmentForm({ ...appointmentForm, appointment_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apt_time">Saat *</Label>
                  <Input
                    id="apt_time"
                    type="time"
                    value={appointmentForm.appointment_time}
                    onChange={(e) => setAppointmentForm({ ...appointmentForm, appointment_time: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Süre</Label>
                <Select
                  value={appointmentForm.duration_minutes}
                  onValueChange={(value) => setAppointmentForm({ ...appointmentForm, duration_minutes: value })}
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
              <div className="space-y-2">
                <Label htmlFor="apt_notes">Randevu Notu</Label>
                <Textarea
                  id="apt_notes"
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button type="submit" className="w-full">
                Randevu Oluştur
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Notes Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Seans Notları
            </CardTitle>
            <Button onClick={handleSaveNotes} disabled={saving} size="sm">
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
