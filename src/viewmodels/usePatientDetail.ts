import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import { useDb } from "@/services/ServiceContext";
import { PatientRepository } from "@/repositories/PatientRepository";
import { AppointmentRepository } from "@/repositories/AppointmentRepository";
import { MedicationRepository } from "@/repositories/MedicationRepository";
import { ReminderRepository } from "@/repositories/ReminderRepository";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";
import { checkAppointmentConflict } from "@/lib/appointmentUtils";

export interface PatientInfo {
  id: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  meslek: string | null;
  notes: string | null;
}

export interface PatientAppointment {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  created_at: string;
}

export interface DiagnosisHistory {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  appointment_date: string;
}

export interface AppointmentFormData {
  appointment_date: string;
  appointment_time: string;
  duration_minutes: string;
  notes: string;
  reminder_time: string;
}

// Built on every call: the default date is today's local date, not the UTC date
// of the day the app was started.
const defaultForm = (): AppointmentFormData => ({
  appointment_date: format(new Date(), "yyyy-MM-dd"),
  appointment_time: "09:00",
  duration_minutes: "60",
  notes: "",
  reminder_time: "1_day",
});

const REMINDER_OFFSETS: Record<string, number> = {
  "1_hour": 60 * 60 * 1000,
  "3_hours": 3 * 60 * 60 * 1000,
  "1_day": 24 * 60 * 60 * 1000,
  "2_days": 2 * 24 * 60 * 60 * 1000,
};

export function usePatientDetail(patientId: string) {
  const db = useDb();
  const patientRepo = useMemo(() => new PatientRepository(db), [db]);
  const appointmentRepo = useMemo(() => new AppointmentRepository(db), [db]);
  const medicationRepo = useMemo(() => new MedicationRepository(db), [db]);
  const reminderRepo = useMemo(() => new ReminderRepository(db), [db]);

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [medications, setMedications] = useState<DiagnosisHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpenRaw, setIsDialogOpenRaw] = useState(false);
  const setIsDialogOpen = useCallback((open: boolean) => {
    setIsDialogOpenRaw(open);
    if (!open) {
      setFormData(defaultForm());
      setConflictWarning(null);
    }
  }, []);
  const isDialogOpen = isDialogOpenRaw;
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [diagSearchTerm, setDiagSearchTerm] = useState("");
  const [diagDateFilter, setDiagDateFilter] = useState<string>("");
  const [deleteAppointmentId, setDeleteAppointmentId] = useState<string | null>(null);
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  // In-flight flag in a ref: a state flag is read from a stale closure when two
  // submits come from the same render, and both would pass.
  const appointmentInFlight = useRef(false);
  const [formData, setFormData] = useState<AppointmentFormData>(defaultForm);

  const fetchData = useCallback(async () => {
    try {
      const [patientData, appointmentsData] = await Promise.all([
        patientRepo.getById(patientId),
        appointmentRepo.getByPatient(patientId),
      ]);
      setPatient(patientData);
      setAppointments(appointmentsData || []);

      // Fetch medications for all appointments of this patient
      if (appointmentsData && appointmentsData.length > 0) {
        const appointmentIds = appointmentsData.map((a) => a.id);
        const medsData = await medicationRepo.getByAppointmentIds(appointmentIds);
        setMedications(medsData);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [patientId, patientRepo, appointmentRepo, medicationRepo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      } catch {
        // Conflict check is non-critical
      } finally {
        setCheckingConflict(false);
      }
    };

    const debounce = setTimeout(checkConflict, 300);
    return () => clearTimeout(debounce);
  }, [formData.appointment_date, formData.appointment_time, formData.duration_minutes, db]);

  // Filter diagnoses based on search and date
  const filteredDiagnoses = useMemo(() => {
    return medications.filter((med) => {
      const matchesSearch = med.medication_name
        .toLowerCase()
        .includes(diagSearchTerm.toLowerCase());

      let matchesDate = true;
      if (diagDateFilter && med.appointment_date) {
        const medDate = new Date(med.appointment_date);
        const [filterYear, filterMonth] = diagDateFilter.split("-").map(Number);
        matchesDate =
          medDate.getFullYear() === filterYear && medDate.getMonth() + 1 === filterMonth;
      }

      return matchesSearch && matchesDate;
    });
  }, [medications, diagSearchTerm, diagDateFilter]);

  // Detect diagnosis changes between consecutive entries
  const getDiagnosisChanged = useCallback(
    (index: number): boolean => {
      if (index >= filteredDiagnoses.length - 1) return false;
      return (
        filteredDiagnoses[index].medication_name !==
        filteredDiagnoses[index + 1].medication_name
      );
    },
    [filteredDiagnoses]
  );

  const createAppointment = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      // Ignore submits that arrive while a create is running or while the dialog
      // is already closing (Radix keeps it on screen for the exit animation).
      if (appointmentInFlight.current || !isDialogOpenRaw) return;

      appointmentInFlight.current = true;
      setCreatingAppointment(true);
      try {
        // The doctor is the owner of the open local database. The former
        // auth.getUser() call was a network request to the Auth server.
        const doctorId = db.getCurrentUserId();
        if (!doctorId) throw new Error("Kullanıcı bulunamadı");

        const appointmentDateTime = new Date(
          `${formData.appointment_date}T${formData.appointment_time}`
        );
        if (isNaN(appointmentDateTime.getTime())) {
          toast.error("Geçersiz tarih veya saat formatı");
          return;
        }
        // Past times are allowed on purpose: sessions are recorded after they take place.
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

        const appointmentData = await appointmentRepo.create({
          patient_id: patientId,
          doctor_id: doctorId,
          appointment_date: appointmentDateTime.toISOString(),
          duration_minutes: durationMinutes,
          notes: formData.notes || null,
        });

        // Create reminder if selected
        if (formData.reminder_time !== "none" && appointmentData) {
          const offset =
            REMINDER_OFFSETS[formData.reminder_time] || 24 * 60 * 60 * 1000;
          const reminderTime = new Date(appointmentDateTime.getTime() - offset);

          await reminderRepo.create({
            appointment_id: appointmentData.id,
            reminder_type: "in_app",
            reminder_time: reminderTime.toISOString(),
          });
        }

        toast.success("Randevu oluşturuldu");
        setIsDialogOpen(false);
        fetchData();
      } catch (error: unknown) {
        toast.error(handleError(error, "Randevu oluşturulamadı"));
      } finally {
        appointmentInFlight.current = false;
        setCreatingAppointment(false);
      }
    },
    [
      formData,
      patientId,
      db,
      appointmentRepo,
      reminderRepo,
      fetchData,
      isDialogOpenRaw,
      setIsDialogOpen,
    ]
  );

  const deleteAppointment = useCallback(
    async (appointmentId: string) => {
      try {
        await appointmentRepo.delete(appointmentId);
        toast.success("Randevu silindi");
        fetchData();
      } catch (error: unknown) {
        toast.error(handleError(error, "Randevu silinemedi"));
      }
    },
    [appointmentRepo, fetchData]
  );

  const calculateAge = useCallback((dateOfBirth: string | null): string => {
    if (!dateOfBirth) return "";
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age} yaş`;
  }, []);

  const getStatusLabel = useCallback((status: string): string => {
    switch (status) {
      case "completed":
        return "Tamamlandı";
      case "cancelled":
        return "İptal";
      default:
        return "Planlandı";
    }
  }, []);

  const getStatusColor = useCallback((status: string): string => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-primary/10 text-primary";
    }
  }, []);

  return {
    // State
    patient,
    appointments,
    medications,
    loading,
    isDialogOpen,
    conflictWarning,
    checkingConflict,
    diagSearchTerm,
    diagDateFilter,
    deleteAppointmentId,
    creatingAppointment,
    formData,
    filteredDiagnoses,

    // Setters
    setIsDialogOpen,
    setDiagSearchTerm,
    setDiagDateFilter,
    setDeleteAppointmentId,
    setFormData,

    // Actions
    createAppointment,
    deleteAppointment,
    calculateAge,
    getStatusLabel,
    getStatusColor,
    getDiagnosisChanged,
    refresh: fetchData,
  };
}
