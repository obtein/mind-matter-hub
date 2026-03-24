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
import { ArrowLeft, Plus, Stethoscope, Save, Calendar, Clock, Trash2, Loader2, FileText, CheckCircle, XCircle, Bell } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useAppointment } from "@/viewmodels/useAppointment";

interface AppointmentDetailViewProps {
  appointmentId: string;
  patientId: string;
  onBack: () => void;
}

export const AppointmentDetailView = ({ appointmentId, patientId, onBack }: AppointmentDetailViewProps) => {
  const vm = useAppointment(appointmentId, patientId);

  if (vm.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!vm.appointment || !vm.patient) {
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
            {format(new Date(vm.appointment.appointment_date), "d MMMM yyyy - HH:mm", { locale: tr })}
          </h1>
          <p className="text-muted-foreground">{vm.patient.full_name} - Randevu Detayı</p>
        </div>
        <Dialog open={vm.isNewAppointmentDialogOpen} onOpenChange={vm.setIsNewAppointmentDialogOpen}>
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
            <form onSubmit={(e) => { e.preventDefault(); vm.createNewAppointment(e); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="apt_date">Tarih *</Label>
                  <Input
                    id="apt_date"
                    type="date"
                    value={vm.newAppointmentForm.appointment_date}
                    onChange={(e) => vm.setNewAppointmentForm({ ...vm.newAppointmentForm, appointment_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apt_time">Saat *</Label>
                  <Input
                    id="apt_time"
                    type="time"
                    value={vm.newAppointmentForm.appointment_time}
                    onChange={(e) => vm.setNewAppointmentForm({ ...vm.newAppointmentForm, appointment_time: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Süre</Label>
                <Select
                  value={vm.newAppointmentForm.duration_minutes}
                  onValueChange={(value) => vm.setNewAppointmentForm({ ...vm.newAppointmentForm, duration_minutes: value })}
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
              {(vm.conflictWarning || vm.checkingConflict) && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  vm.checkingConflict
                    ? "bg-muted text-muted-foreground"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                }`}>
                  {vm.checkingConflict ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Kontrol ediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4" />
                      <span>{vm.conflictWarning}</span>
                    </>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="apt_reminder">Hatırlatma</Label>
                <Select
                  value={vm.newAppointmentForm.reminder_time}
                  onValueChange={(value) => vm.setNewAppointmentForm({ ...vm.newAppointmentForm, reminder_time: value })}
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
                  value={vm.newAppointmentForm.notes}
                  onChange={(e) => vm.setNewAppointmentForm({ ...vm.newAppointmentForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button type="submit" className="w-full" disabled={!!vm.conflictWarning || vm.checkingConflict}>
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
              <Select value={vm.status} onValueChange={vm.setStatus}>
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
              {format(new Date(vm.appointment.appointment_date), "d MMMM yyyy", { locale: tr })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {format(new Date(vm.appointment.appointment_date), "HH:mm", { locale: tr })}
            </span>
            <span>{vm.appointment.duration_minutes} dakika</span>
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
            <Button onClick={vm.saveNotes} disabled={vm.saving} size="sm">
              <Save className="w-4 h-4 mr-2" />
              {vm.saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={vm.notes}
            onChange={(e) => vm.setNotes(e.target.value)}
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
              <Dialog open={vm.isMedicationDialogOpen} onOpenChange={vm.setIsMedicationDialogOpen}>
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
                <form onSubmit={(e) => { e.preventDefault(); vm.addMedication(e); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="med_name">Tanı *</Label>
                    <Input
                      id="med_name"
                      value={vm.medicationForm.medication_name}
                      onChange={(e) => vm.setMedicationForm({ ...vm.medicationForm, medication_name: e.target.value })}
                      placeholder="Örn: Yaygın Anksiyete Bozukluğu"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dosage">Detay</Label>
                    <Input
                      id="dosage"
                      value={vm.medicationForm.dosage}
                      onChange={(e) => vm.setMedicationForm({ ...vm.medicationForm, dosage: e.target.value })}
                      placeholder="Örn: F41.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instructions">Notlar</Label>
                    <Textarea
                      id="instructions"
                      value={vm.medicationForm.instructions}
                      onChange={(e) => vm.setMedicationForm({ ...vm.medicationForm, instructions: e.target.value })}
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
          {vm.medications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Stethoscope className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Henüz tanı eklenmemiş</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vm.medications.map((med) => (
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
                    onClick={() => vm.setDeleteMedicationId(med.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <AlertDialog open={!!vm.deleteMedicationId} onOpenChange={(open) => !open && vm.setDeleteMedicationId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tanı Silme</AlertDialogTitle>
                <AlertDialogDescription>Bu tanıyı silmek istediğinizden emin misiniz?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { if (vm.deleteMedicationId) vm.deleteMedication(vm.deleteMedicationId); vm.setDeleteMedicationId(null); }}
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
