-- Fix RLS policies to prevent anonymous access
-- The issue is that RESTRICTIVE policies only apply when there's at least one PERMISSIVE policy
-- that grants access. Without a PERMISSIVE policy, RESTRICTIVE policies are bypassed for anonymous users.

-- Solution: Convert the SELECT policy from RESTRICTIVE to PERMISSIVE for the patients table
-- This ensures the policy applies to ALL users including anonymous ones

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Doctors can view their own patients" ON public.patients;

-- Create a PERMISSIVE SELECT policy that properly restricts access
CREATE POLICY "Doctors can view their own patients"
  ON public.patients
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- Also update the other tables with the same pattern to ensure consistency

-- appointments table
DROP POLICY IF EXISTS "Doctors can view their own appointments" ON public.appointments;
CREATE POLICY "Doctors can view their own appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- patient_notes table
DROP POLICY IF EXISTS "Doctors can view their own patient notes" ON public.patient_notes;
CREATE POLICY "Doctors can view their own patient notes"
  ON public.patient_notes
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = doctor_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- session_medications table
DROP POLICY IF EXISTS "Doctors can view medications for their appointments" ON public.session_medications;
CREATE POLICY "Doctors can view medications for their appointments"
  ON public.session_medications
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = session_medications.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

-- appointment_reminders table
DROP POLICY IF EXISTS "Doctors can view reminders for their appointments" ON public.appointment_reminders;
CREATE POLICY "Doctors can view reminders for their appointments"
  ON public.appointment_reminders
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = appointment_reminders.appointment_id
    AND appointments.doctor_id = auth.uid()
    AND public.has_role(auth.uid(), 'doctor'::user_role)
  ));

-- notifications table
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) AND public.has_role(auth.uid(), 'doctor'::user_role));

-- profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);