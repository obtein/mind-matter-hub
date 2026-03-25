import { useState, useEffect, useMemo, useCallback } from "react";
import { useDb } from "@/services/ServiceContext";
import { AppointmentRepository } from "@/repositories/AppointmentRepository";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";
import { addDays, subDays, isSameDay, parseISO } from "date-fns";

export interface ScheduleAppointment {
  id: string;
  patient_id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  patients: { full_name: string } | null;
}

export const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 - 20:00

export function useSchedule() {
  const db = useDb();
  const appointmentRepo = useMemo(() => new AppointmentRepository(db), [db]);

  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const data = await appointmentRepo.getByDateRange(
        startOfDay.toISOString(),
        endOfDay.toISOString()
      );
      setAppointments(data || []);
      setError(null);
    } catch (error: unknown) {
      setError(handleError(error, "Randevular yüklenemedi"));
      toast.error(handleError(error, "Randevular yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [appointmentRepo, selectedDate]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const goToPreviousDay = useCallback(() => {
    setSelectedDate((prev) => subDays(prev, 1));
  }, []);

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const getAppointmentForHour = useCallback(
    (hour: number): ScheduleAppointment | undefined => {
      return appointments.find((apt) => {
        try {
          if (!apt.appointment_date) return false;
          const aptDate = parseISO(apt.appointment_date);
          return aptDate.getHours() === hour;
        } catch {
          return false;
        }
      });
    },
    [appointments]
  );

  const isToday = useMemo(() => isSameDay(selectedDate, new Date()), [selectedDate]);

  return {
    // State
    appointments,
    loading,
    error,
    selectedDate,
    isToday,

    // Setters
    setSelectedDate,

    // Actions
    goToPreviousDay,
    goToNextDay,
    goToToday,
    handleDateSelect,
    getAppointmentForHour,
    refresh: fetchAppointments,
  };
}
