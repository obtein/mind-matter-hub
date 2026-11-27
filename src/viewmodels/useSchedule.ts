import { useState, useEffect, useMemo, useCallback } from "react";
import { useDb } from "@/services/ServiceContext";
import { AppointmentRepository } from "@/repositories/AppointmentRepository";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";
import { addDays, subDays, isSameDay } from "date-fns";
import { appointmentsForHour, scheduleHours } from "@/lib/schedule";

export interface ScheduleAppointment {
  id: string;
  patient_id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  patients: { full_name: string } | null;
}

const SELECTED_DATE_KEY = "psitrak_schedule_date";

function safeGetSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSessionItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function useSchedule() {
  const db = useDb();
  const appointmentRepo = useMemo(() => new AppointmentRepository(db), [db]);

  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The schedule unmounts when an appointment is opened; keep the chosen day for "back".
  const [selectedDate, setSelectedDateState] = useState<Date>(() => {
    const saved = safeGetSessionItem(SELECTED_DATE_KEY);
    const d = saved ? new Date(saved) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  });
  const setSelectedDate = useCallback((next: Date | ((prev: Date) => Date)) => {
    setSelectedDateState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      safeSetSessionItem(SELECTED_DATE_KEY, value.toISOString());
      return value;
    });
  }, []);

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
  }, [setSelectedDate]);

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, 1));
  }, [setSelectedDate]);

  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
  }, [setSelectedDate]);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
  }, [setSelectedDate]);

  const hours = useMemo(() => scheduleHours(appointments), [appointments]);

  const getAppointmentsForHour = useCallback(
    (hour: number): ScheduleAppointment[] => appointmentsForHour(appointments, hour),
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
    hours,
    getAppointmentsForHour,
    refresh: fetchAppointments,
  };
}
