// ── Row types (mirrors Supabase schema) ──

export interface Patient {
  id: string;
  doctor_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  emergency_phone: string | null;
  tc_identity: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientInsert {
  full_name: string;
  doctor_id: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  emergency_phone?: string | null;
  tc_identity?: string | null;
  notes?: string | null;
}

export interface Appointment {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_date: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentWithPatient {
  id: string;
  patient_id: string;
  appointment_date: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  patients: { full_name: string } | null;
}

export interface AppointmentInsert {
  doctor_id: string;
  patient_id: string;
  appointment_date: string;
  duration_minutes?: number;
  notes?: string | null;
}

export interface Medication {
  id: string;
  appointment_id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  created_at: string;
}

export interface MedicationWithDate {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  appointment_date: string;
}

export interface MedicationRecord {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  created_at: string;
  appointment: {
    appointment_date: string;
    patient: { id: string; full_name: string } | null;
  } | null;
}

export interface MedicationInsert {
  appointment_id: string;
  medication_name: string;
  dosage?: string | null;
  instructions?: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  related_appointment_id: string | null;
  related_patient_id: string | null;
  created_at: string;
}

export interface NotificationInsert {
  user_id: string;
  title: string;
  message: string;
  type?: string;
  related_appointment_id?: string | null;
  related_patient_id?: string | null;
}

export interface ReminderInsert {
  appointment_id: string;
  reminder_type: string;
  reminder_time: string;
}

export interface UpcomingAppointment {
  id: string;
  appointment_date: string;
  patients: { full_name: string } | null;
}

// ── Service interface ──

export interface DbService {
  // Patients
  getPatients(): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | null>;
  createPatient(data: PatientInsert): Promise<Patient>;
  updatePatient(id: string, data: Partial<Omit<PatientInsert, "doctor_id">>): Promise<void>;
  deletePatient(id: string): Promise<void>;
  getLastAppointmentDate(patientId: string): Promise<string | null>;
  getPatientsForStats(): Promise<Pick<Patient, "id" | "gender" | "date_of_birth">[]>;

  // Appointments
  getAppointmentsByDateRange(start: string, end: string): Promise<AppointmentWithPatient[]>;
  getAppointmentsByPatient(patientId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | null>;
  createAppointment(data: AppointmentInsert): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<Pick<Appointment, "notes" | "status">>): Promise<void>;
  deleteAppointment(id: string): Promise<void>;
  getMonthlyAppointmentDates(start: string, end: string): Promise<string[]>;
  getAppointmentsForStats(): Promise<Pick<Appointment, "id" | "appointment_date" | "status">[]>;
  getAppointmentsForConflictCheck(
    dayStart: string,
    dayEnd: string,
    excludeId?: string
  ): Promise<AppointmentWithPatient[]>;
  getUpcomingAppointments(now: string, tomorrow: string): Promise<UpcomingAppointment[]>;

  // Medications
  getMedicationsByAppointment(appointmentId: string): Promise<Medication[]>;
  getMedicationsByAppointmentIds(ids: string[]): Promise<MedicationWithDate[]>;
  getAllMedicationsWithDetails(): Promise<MedicationRecord[]>;
  createMedication(data: MedicationInsert): Promise<void>;
  deleteMedication(id: string): Promise<void>;

  // Notifications
  getNotifications(limit?: number): Promise<Notification[]>;
  getNotificationsByAppointmentIds(ids: string[]): Promise<{ related_appointment_id: string }[]>;
  createNotification(data: NotificationInsert): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  subscribeToNotifications(callback: () => void): { unsubscribe: () => void };

  // Reminders
  createReminder(data: ReminderInsert): Promise<void>;

  // Profiles
  getProfile(): Promise<{ full_name: string } | null>;

  // Patient name lookup (used by AppointmentDetailView)
  getPatientName(id: string): Promise<{ id: string; full_name: string } | null>;
}
