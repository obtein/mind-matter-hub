import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth, useDb } from "@/services/ServiceContext";
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
  const auth = useAuth();
  const db = useDb();
  const appointmentRepo = useMemo(() => new AppointmentRepository(db), [db]);
  const medicationRepo = useMemo(() => new MedicationRepository(db), [db]);
  const patientRepo = useMemo(() => new PatientRepository(db), [db]);
  const reminderRepo = useMemo(() => new ReminderRepository(db), [db]);

  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [patient, setPatient] = useState<PatientName | null>(null);
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
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [appointmentId, patientId, appointmentRepo, patientRepo, medicationRepo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    } catch (error: any) {
      toast.error("Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }, [appointmentId, notes, status, appointmentRepo]);

  const addMedication = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!medicationForm.medication_name.trim()) {
        toast.error("Tanı boş olamaz");
        return;
      }

      try {
        await medicationRepo.create({
          appointment_id: appointmentId,
          medication_name: medicationForm.medication_name.trim(),
          dosage: medicationForm.dosage || null,
          instructions: medicationForm.instructions || null,
        });

        toast.success("Tanı eklendi");
        setIsMedicationDialogOpen(false);
        setMedicationForm({ ...EMPTY_MEDICATION_FORM });
        fetchData();
      } catch (error: any) {
        toast.error("Tanı eklenemedi");
      }
    },
    [appointmentId, medicationForm, medicationRepo, fetchData]
  );

  const deleteMedication = useCallback(
    async (id: string) => {
      try {
        await medicationRepo.delete(id);
        toast.success("Tanı silindi");
        fetchData();
      } catch {
        toast.error("Tanı silinemedi");
      }
    },
    [medicationRepo, fetchData]
  );

  const createNewAppointment = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

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

        const appointmentData = await appointmentRepo.create({
          doctor_id: user.id,
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
        setNewAppointmentForm({ ...DEFAULT_NEW_APPOINTMENT_FORM });
      } catch (error: any) {
        toast.error("Randevu oluşturulamadı");
      }
    },
    [auth, newAppointmentForm, patientId, db, appointmentRepo, reminderRepo]
  );

  return {
    // State
    appointment,
    patient,
    medications,
    loading,
    saving,
    notes,
    status,
    isMedicationDialogOpen,
    isNewAppointmentDialogOpen,
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
