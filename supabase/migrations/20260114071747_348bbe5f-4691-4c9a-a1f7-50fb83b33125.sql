-- Fix ALL RLS policies to explicitly require authentication
-- This prevents anonymous access to all tables

-- ============ PATIENTS TABLE ============
DROP POLICY IF EXISTS "Doctors can insert their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can update their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can delete their own patients" ON public.patients;

CREATE POLICY "Doctors can insert their own patients"
  ON public.patients FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own patients"
  ON public.patients FOR UPDATE TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own patients"
  ON public.patients FOR DELETE TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- ============ APPOINTMENTS TABLE ============
DROP POLICY IF EXISTS "Doctors can insert their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can update their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can delete their own appointments" ON public.appointments;

CREATE POLICY "Doctors can insert their own appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- ============ PATIENT_NOTES TABLE ============
DROP POLICY IF EXISTS "Doctors can insert their own patient notes" ON public.patient_notes;
DROP POLICY IF EXISTS "Doctors can update their own patient notes" ON public.patient_notes;
DROP POLICY IF EXISTS "Doctors can delete their own patient notes" ON public.patient_notes;

CREATE POLICY "Doctors can insert their own patient notes"
  ON public.patient_notes FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own patient notes"
  ON public.patient_notes FOR UPDATE TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own patient notes"
  ON public.patient_notes FOR DELETE TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- ============ SESSION_MEDICATIONS TABLE ============
DROP POLICY IF EXISTS "Doctors can insert medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can update medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can delete medications for their appointments" ON public.session_medications;

CREATE POLICY "Doctors can insert medications for their appointments"
  ON public.session_medications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = session_medications.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

CREATE POLICY "Doctors can update medications for their appointments"
  ON public.session_medications FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = session_medications.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

CREATE POLICY "Doctors can delete medications for their appointments"
  ON public.session_medications FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = session_medications.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

-- ============ APPOINTMENT_REMINDERS TABLE ============
DROP POLICY IF EXISTS "Doctors can insert reminders for their appointments" ON public.appointment_reminders;
DROP POLICY IF EXISTS "Doctors can update reminders for their appointments" ON public.appointment_reminders;
DROP POLICY IF EXISTS "Doctors can delete reminders for their appointments" ON public.appointment_reminders;

CREATE POLICY "Doctors can insert reminders for their appointments"
  ON public.appointment_reminders FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = appointment_reminders.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

CREATE POLICY "Doctors can update reminders for their appointments"
  ON public.appointment_reminders FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = appointment_reminders.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

CREATE POLICY "Doctors can delete reminders for their appointments"
  ON public.appointment_reminders FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = appointment_reminders.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

-- ============ NOTIFICATIONS TABLE ============
DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;

CREATE POLICY "Users can insert their own notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- ============ PROFILES TABLE ============
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ============ USER_ROLES TABLE ============
-- Update SELECT policy to require authentication
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);