import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDb } from "@/services/ServiceContext";
import { AppointmentRepository } from "@/repositories/AppointmentRepository";
import { MedicationRepository } from "@/repositories/MedicationRepository";
import { PatientRepository } from "@/repositories/PatientRepository";
import { ReminderRepository } from "@/repositories/ReminderRepository";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";
import { checkAppointmentConflict } from "@/lib/appointmentUtils";

export interface AppointmentInfo {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  patient_id: string;
}

export interface Medication {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
}

export interface PatientName {
  id: string;
  full_name: string;
}

export interface MedicationFormData {
  medication_name: string;
  dosage: string;
  instructions: string;
}

export interface NewAppointmentFormData {
  appointment_date: string;
  appointment_time: string;
  duration_minutes: string;
  notes: string;
  reminder_time: string;
}

const EMPTY_MEDICATION_FORM: MedicationFormData = {
  medication_name: "",
  dosage: "",
  instructions: "",
};

const DEFAULT_NEW_APPOINTMENT_FORM: NewAppointmentFormData = {
  appointment_date: "",
  appointment_time: "09:00",
  duration_minutes: "60",
  notes: "",
  reminder_time: "1_day",
};

const REMINDER_OFFSETS: Record<string, number> = {
  "1_hour": 60 * 60 * 1000,
  "3_hours": 3 * 60 * 60 * 1000,
  "1_day": 24 * 60 * 60 * 1000,
  "2_days": 2 * 24 * 60 * 60 * 1000,
};

export function useAppointment(appointmentId: string, patientId: string) {
  const db = useDb();
  const appointmentRepo = useMemo(() => new AppointmentRepository(db), [db]);
  const medicationRepo = useMemo(() => new MedicationRepository(db), [db]);
  const patientRepo = useMemo(() => new PatientRepository(db), [db]);
  const reminderRepo = useMemo(() => new ReminderRepository(db), [db]);

  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [patient, setPatient] = useState<PatientName | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [isMedicationDialogOpenRaw, setIsMedicationDialogOpenRaw] = useState(false);
  const [isNewAppointmentDialogOpenRaw, setIsNewAppointmentDialogOpenRaw] = useState(false);

  // Reset form when dialog closes
  const setIsMedicationDialogOpen = useCallback((open: boolean) => {
    setIsMedicationDialogOpenRaw(open);
    if (!open) setMedicationForm({ ...EMPTY_MEDICATION_FORM });
  }, []);

  const setIsNewAppointmentDialogOpen = useCallback((open: boolean) => {
    setIsNewAppointmentDialogOpenRaw(open);
    if (!open) {
      setNewAppointmentForm({ ...DEFAULT_NEW_APPOINTMENT_FORM });
      setConflictWarning(null);
    }
  }, []);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [addingMedication, setAddingMedication] = useState(false);
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  // In-flight flags live in refs: a state flag is read from a stale closure when
  // two submits come from the same render, and both would pass.
  const medicationInFlight = useRef(false);
  const appointmentInFlight = useRef(false);
  const [deleteMedicationId, setDeleteMedicationId] = useState<string | null>(null);
  const [medicationForm, setMedicationForm] = useState<MedicationFormData>({
    ...EMPTY_MEDICATION_FORM,
  });
  const [newAppointmentForm, setNewAppointmentForm] = useState<NewAppointmentFormData>({
    ...DEFAULT_NEW_APPOINTMENT_FORM,
  });

  const fetchData = useCallback(async () => {
    try {
      const [appointmentData, patientData, medicationsData] = await Promise.all([
        appointmentRepo.getById(appointmentId),
        patientRepo.getName(patientId),
        medicationRepo.getByAppointment(appointmentId),
      ]);

      setAppointment(appointmentData);
      setPatient(patientData);
      setMedications(medicationsData || []);
      setNotes(appointmentData?.notes || "");
      setStatus(appointmentData?.status || "scheduled");
      setError(null);
    } catch (error: unknown) {
      setError(handleError(error, "Veriler yüklenemedi"));
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [appointmentId, patientId, appointmentRepo, patientRepo, medicationRepo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reload only the diagnosis list. fetchData would also reset the notes and
  // status fields and discard what the doctor typed but has not saved yet.
  const refreshMedications = useCallback(async () => {
    try {
      setMedications((await medicationRepo.getByAppointment(appointmentId)) || []);
    } catch {
      toast.error("Tanılar yüklenemedi");
    }
  }, [appointmentId, medicationRepo]);

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
  }, [
    newAppointmentForm.appointment_date,
    newAppointmentForm.appointment_time,
    newAppointmentForm.duration_minutes,
    db,
  ]);

  const saveNotes = useCallback(async () => {
    setSaving(true);
    try {
      await appointmentRepo.update(appointmentId, { notes, status });
      toast.success("Kaydedildi");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }, [appointmentId, notes, status, appointmentRepo]);

  const addMedication = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      // Ignore submits that arrive while a create is running or while the dialog
      // is already closing (Radix keeps it on screen for the exit animation).
      if (medicationInFlight.current || !isMedicationDialogOpenRaw) return;

      if (!medicationForm.medication_name.trim()) {
        toast.error("Tanı boş olamaz");
        return;
      }

      medicationInFlight.current = true;
      setAddingMedication(true);
      try {
        await medicationRepo.create({
          appointment_id: appointmentId,
          medication_name: medicationForm.medication_name.trim(),
          dosage: medicationForm.dosage || null,
          instructions: medicationForm.instructions || null,
        });

        toast.success("Tanı eklendi");
        setIsMedicationDialogOpen(false);
        refreshMedications();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Tanı eklenemedi");
      } finally {
        medicationInFlight.current = false;
        setAddingMedication(false);
      }
    },
    [
      appointmentId,
      medicationForm,
      medicationRepo,
      refreshMedications,
      isMedicationDialogOpenRaw,
      setIsMedicationDialogOpen,
    ]
  );

  const deleteMedication = useCallback(
    async (id: string) => {
      try {
        await medicationRepo.delete(id);
        toast.success("Tanı silindi");
        refreshMedications();
      } catch {
        toast.error("Tanı silinemedi");
      }
    },
    [medicationRepo, refreshMedications]
  );

  const createNewAppointment = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (appointmentInFlight.current || !isNewAppointmentDialogOpenRaw) return;

      appointmentInFlight.current = true;
      setCreatingAppointment(true);
      try {
        // The doctor is the owner of the open local database. The former
        // auth.getUser() call was a network request to the Auth server.
        const doctorId = db.getCurrentUserId();
        if (!doctorId) throw new Error("Kullanıcı bulunamadı");

        const appointmentDateTime = new Date(
          `${newAppointmentForm.appointment_date}T${newAppointmentForm.appointment_time}`
        );
        if (isNaN(appointmentDateTime.getTime())) {
          toast.error("Geçersiz tarih veya saat formatı");
          return;
        }
        // Past times are allowed on purpose: sessions are recorded after they take place.
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

        const appointmentData = await appointmentRepo.create({
          doctor_id: doctorId,
          patient_id: patientId,
          appointment_date: appointmentDateTime.toISOString(),
          duration_minutes: durationMinutes,
          notes: newAppointmentForm.notes || null,
        });

        // Create reminder if selected
        if (newAppointmentForm.reminder_time !== "none" && appointmentData) {
          const offset =
            REMINDER_OFFSETS[newAppointmentForm.reminder_time] || 24 * 60 * 60 * 1000;
          const reminderTime = new Date(appointmentDateTime.getTime() - offset);

          await reminderRepo.create({
            appointment_id: appointmentData.id,
            reminder_type: "in_app",
            reminder_time: reminderTime.toISOString(),
          });
        }

        toast.success("Yeni randevu oluşturuldu");
        setIsNewAppointmentDialogOpen(false);
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Randevu oluşturulamadı");
      } finally {
        appointmentInFlight.current = false;
        setCreatingAppointment(false);
      }
    },
    [
      newAppointmentForm,
      patientId,
      db,
      appointmentRepo,
      reminderRepo,
      isNewAppointmentDialogOpenRaw,
      setIsNewAppointmentDialogOpen,
    ]
  );

  return {
    // State
    appointment,
    patient,
    medications,
    loading,
    error,
    saving,
    notes,
    status,
    isMedicationDialogOpen: isMedicationDialogOpenRaw,
    isNewAppointmentDialogOpen: isNewAppointmentDialogOpenRaw,
    addingMedication,
    creatingAppointment,
    conflictWarning,
    checkingConflict,
    deleteMedicationId,
    medicationForm,
    newAppointmentForm,

    // Setters
    setNotes,
    setStatus,
    setIsMedicationDialogOpen,
    setIsNewAppointmentDialogOpen,
    setDeleteMedicationId,
    setMedicationForm,
    setNewAppointmentForm,

    // Actions
    saveNotes,
    addMedication,
    deleteMedication,
    createNewAppointment,
    refresh: fetchData,
  };
}
