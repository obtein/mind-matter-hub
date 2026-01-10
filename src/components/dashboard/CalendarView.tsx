import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Plus, Clock, User, Trash2, Loader2, CalendarDays } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { tr } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Appointment = Tables<"appointments"> & {
  patients: { full_name: string } | null;
};
type Patient = Tables<"patients">;

export const CalendarView = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    patient_id: "",
    appointment_date: "",
    appointment_time: "",
    duration_minutes: "30",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [appointmentsRes, patientsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("*, patients(full_name)")
          .order("appointment_date", { ascending: true }),
        supabase.from("patients").select("*").order("full_name"),
      ]);

      if (appointmentsRes.error) throw appointmentsRes.error;
      if (patientsRes.error) throw patientsRes.error;

      setAppointments(appointmentsRes.data || []);
      setPatients(patientsRes.data || []);
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const appointmentDateTime = new Date(
        `${formData.appointment_date}T${formData.appointment_time}`
      );

      const { error } = await supabase.from("appointments").insert({
        doctor_id: user.id,
        patient_id: formData.patient_id,
        appointment_date: appointmentDateTime.toISOString(),
        duration_minutes: parseInt(formData.duration_minutes),
        notes: formData.notes || null,
      });

      if (error) throw error;

      toast.success("Randevu oluşturuldu");
      setIsDialogOpen(false);
      setFormData({
        patient_id: "",
        appointment_date: "",
        appointment_time: "",
        duration_minutes: "30",
        notes: "",
      });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Randevu oluşturulamadı");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu randevuyu iptal etmek istediğinizden emin misiniz?")) return;

    try {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
      toast.success("Randevu iptal edildi");
      fetchData();
    } catch (error: any) {
      toast.error("Randevu iptal edilemedi");
    }
  };

  const selectedDayAppointments = appointments.filter((apt) =>
    isSameDay(new Date(apt.appointment_date), selectedDate)
  );

  const appointmentDates = appointments.map((apt) => new Date(apt.appointment_date));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Takvim</h1>
          <p className="text-muted-foreground">Randevularınızı planlayın</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-primary" disabled={patients.length === 0}>
              <Plus className="w-4 h-4 mr-2" />
              Yeni Randevu
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Yeni Randevu Oluştur</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="patient">Hasta *</Label>
                <Select
                  value={formData.patient_id}
                  onValueChange={(value) => setFormData({ ...formData, patient_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Hasta seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Tarih *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.appointment_date}
                    onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Saat *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.appointment_time}
                    onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Süre (dakika)</Label>
                <Select
                  value={formData.duration_minutes}
                  onValueChange={(value) => setFormData({ ...formData, duration_minutes: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 dakika</SelectItem>
                    <SelectItem value="30">30 dakika</SelectItem>
                    <SelectItem value="45">45 dakika</SelectItem>
                    <SelectItem value="60">1 saat</SelectItem>
                    <SelectItem value="90">1.5 saat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notlar</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button type="submit" className="w-full" disabled={!formData.patient_id}>
                Randevu Oluştur
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {patients.length === 0 && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="py-4">
            <p className="text-sm text-warning-foreground">
              Randevu oluşturabilmek için önce hasta eklemeniz gerekiyor.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        <Card className="h-fit">
          <CardContent className="p-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={tr}
              modifiers={{
                hasAppointment: appointmentDates,
              }}
              modifiersStyles={{
                hasAppointment: {
                  backgroundColor: "hsl(var(--primary) / 0.15)",
                  fontWeight: "bold",
                },
              }}
              className="rounded-md"
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-display font-semibold">
            {format(selectedDate, "d MMMM yyyy, EEEE", { locale: tr })}
          </h2>

          {selectedDayAppointments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CalendarDays className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Bu tarihte randevu yok</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {selectedDayAppointments.map((apt, index) => (
                <Card 
                  key={apt.id} 
                  className="group hover:shadow-soft transition-all duration-300 animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Clock className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-lg">
                              {format(new Date(apt.appointment_date), "HH:mm")}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              ({apt.duration_minutes} dk)
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="w-4 h-4" />
                            <span>{apt.patients?.full_name || "Bilinmeyen Hasta"}</span>
                          </div>
                          {apt.notes && (
                            <p className="text-sm text-muted-foreground mt-2">{apt.notes}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={() => handleDelete(apt.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
