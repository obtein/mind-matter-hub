import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, User, Loader2 } from "lucide-react";
import { handleError } from "@/lib/errorHandler";
import { format, addDays, subDays, isSameDay, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { MonthlyCalendar } from "./MonthlyCalendar";

interface Appointment {
  id: string;
  patient_id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  patients: { full_name: string } | null;
}

interface DailyScheduleViewProps {
  onAppointmentSelect?: (appointmentId: string, patientId: string) => void;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 - 20:00

export const DailyScheduleView = ({ onAppointmentSelect }: DailyScheduleViewProps) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  useEffect(() => {
    fetchAppointments();
  }, [selectedDate]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, appointment_date, duration_minutes, notes, status, patients(full_name)")
        .gte("appointment_date", startOfDay.toISOString())
        .lte("appointment_date", endOfDay.toISOString())
        .order("appointment_date", { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error: unknown) {
      toast.error(handleError(error, "Randevular yüklenemedi"));
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousDay = () => setSelectedDate(subDays(selectedDate, 1));
  const goToNextDay = () => setSelectedDate(addDays(selectedDate, 1));
  const goToToday = () => setSelectedDate(new Date());

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const getAppointmentForHour = (hour: number) => {
    return appointments.find((apt) => {
      const aptDate = parseISO(apt.appointment_date);
      return aptDate.getHours() === hour;
    });
  };

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Randevu Takvimi</h1>
          <p className="text-muted-foreground">Aylık ve günlük randevularınız</p>
        </div>
      </div>

      {/* Monthly Calendar */}
      <MonthlyCalendar selectedDate={selectedDate} onDateSelect={handleDateSelect} />

      {/* Date Navigation */}
      <div className="flex items-center justify-between gap-4 bg-card rounded-xl p-4 shadow-soft border">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousDay}
          className="h-10 w-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-4">
          <div className="text-center">
            <h2 className="text-xl font-display font-semibold">
              {format(selectedDate, "d MMMM yyyy", { locale: tr })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {format(selectedDate, "EEEE", { locale: tr })}
            </p>
          </div>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={goToToday}>
              Bugün
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextDay}
          className="h-10 w-10"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Time Slots */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
      <div className="space-y-2">
        {HOURS.map((hour) => {
          const appointment = getAppointmentForHour(hour);
          const timeString = `${hour.toString().padStart(2, "0")}:00`;
          const currentHour = new Date().getHours();
          const isPast = isToday && hour < currentHour;
          const isCurrent = isToday && hour === currentHour;

          return (
            <div
              key={hour}
              className={`flex gap-4 ${isPast ? "opacity-50" : ""}`}
            >
              <div
                className={`w-16 flex-shrink-0 text-sm font-medium py-3 text-right pr-2 ${
                  isCurrent ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {timeString}
              </div>

              <div className="flex-1">
                {appointment ? (
                  <Card
                    className={`border-l-4 cursor-pointer ${
                      appointment.status === "completed"
                        ? "border-l-green-500 bg-green-50/50 dark:bg-green-950/20"
                        : appointment.status === "cancelled"
                        ? "border-l-red-500 bg-red-50/50 dark:bg-red-950/20"
                        : "border-l-primary bg-primary/5"
                    } transition-all hover:shadow-medium`}
                    onClick={() => onAppointmentSelect?.(appointment.id, appointment.patient_id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {appointment.patients?.full_name || "Bilinmeyen Hasta"}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Clock className="w-4 h-4" />
                              <span>{appointment.duration_minutes} dakika</span>
                            </div>
                            {appointment.notes && (
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                                {appointment.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            appointment.status === "completed"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : appointment.status === "cancelled"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {appointment.status === "completed"
                            ? "Tamamlandı"
                            : appointment.status === "cancelled"
                            ? "İptal"
                            : "Planlandı"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div
                    className={`h-16 rounded-lg border border-dashed flex items-center justify-center ${
                      isCurrent
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/50"
                    }`}
                  >
                    <span className="text-sm text-muted-foreground/50">Boş</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
