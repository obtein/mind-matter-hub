-- =============================================
-- SECURITY HARDENING: Add role verification to all RLS policies
-- =============================================

-- 1. Update PATIENTS table policies
DROP POLICY IF EXISTS "Doctors can view their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can insert their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can update their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can delete their own patients" ON public.patients;

CREATE POLICY "Doctors can view their own patients" 
ON public.patients FOR SELECT 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can insert their own patients" 
ON public.patients FOR INSERT 
WITH CHECK (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own patients" 
ON public.patients FOR UPDATE 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own patients" 
ON public.patients FOR DELETE 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

-- 2. Update APPOINTMENTS table policies
DROP POLICY IF EXISTS "Doctors can view their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can insert their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can update their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can delete their own appointments" ON public.appointments;

CREATE POLICY "Doctors can view their own appointments" 
ON public.appointments FOR SELECT 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can insert their own appointments" 
ON public.appointments FOR INSERT 
WITH CHECK (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own appointments" 
ON public.appointments FOR UPDATE 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own appointments" 
ON public.appointments FOR DELETE 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

-- 3. Update PATIENT_NOTES table policies
DROP POLICY IF EXISTS "Doctors can view their own patient notes" ON public.patient_notes;
DROP POLICY IF EXISTS "Doctors can insert their own patient notes" ON public.patient_notes;
DROP POLICY IF EXISTS "Doctors can update their own patient notes" ON public.patient_notes;
DROP POLICY IF EXISTS "Doctors can delete their own patient notes" ON public.patient_notes;

CREATE POLICY "Doctors can view their own patient notes" 
ON public.patient_notes FOR SELECT 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can insert their own patient notes" 
ON public.patient_notes FOR INSERT 
WITH CHECK (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own patient notes" 
ON public.patient_notes FOR UPDATE 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own patient notes" 
ON public.patient_notes FOR DELETE 
USING (auth.uid() = doctor_id AND public.has_role(auth.uid(), 'doctor'::user_role));

-- 4. Update SESSION_MEDICATIONS table policies
DROP POLICY IF EXISTS "Doctors can view medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can insert medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can update medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can delete medications for their appointments" ON public.session_medications;

CREATE POLICY "Doctors can view medications for their appointments" 
ON public.session_medications FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can insert medications for their appointments" 
ON public.session_medications FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can update medications for their appointments" 
ON public.session_medications FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can delete medications for their appointments" 
ON public.session_medications FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

-- 5. Update APPOINTMENT_REMINDERS table policies
DROP POLICY IF EXISTS "Doctors can view reminders for their appointments" ON public.appointment_reminders;
DROP POLICY IF EXISTS "Doctors can insert reminders for their appointments" ON public.appointment_reminders;
DROP POLICY IF EXISTS "Doctors can update reminders for their appointments" ON public.appointment_reminders;
DROP POLICY IF EXISTS "Doctors can delete reminders for their appointments" ON public.appointment_reminders;

CREATE POLICY "Doctors can view reminders for their appointments" 
ON public.appointment_reminders FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can insert reminders for their appointments" 
ON public.appointment_reminders FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can update reminders for their appointments" 
ON public.appointment_reminders FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can delete reminders for their appointments" 
ON public.appointment_reminders FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
  AND public.has_role(auth.uid(), 'doctor'::user_role)
));

-- 6. Update NOTIFICATIONS table policies  
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications" 
ON public.notifications FOR SELECT 
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Users can insert their own notifications" 
ON public.notifications FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Users can update their own notifications" 
ON public.notifications FOR UPDATE 
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Users can delete their own notifications" 
ON public.notifications FOR DELETE 
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'doctor'::user_role));

-- 7. Update PROFILES table policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);