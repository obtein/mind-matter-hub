-- Drop existing RESTRICTIVE policies on session_medications table
DROP POLICY IF EXISTS "Doctors can view medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can insert medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can update medications for their appointments" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can delete medications for their appointments" ON public.session_medications;

-- Create new PERMISSIVE policies with TO authenticated for session_medications
CREATE POLICY "Doctors can view medications for their appointments" 
ON public.session_medications 
FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid() 
  AND has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can insert medications for their appointments" 
ON public.session_medications 
FOR INSERT 
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid() 
  AND has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can update medications for their appointments" 
ON public.session_medications 
FOR UPDATE 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid() 
  AND has_role(auth.uid(), 'doctor'::user_role)
));

CREATE POLICY "Doctors can delete medications for their appointments" 
ON public.session_medications 
FOR DELETE 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid() 
  AND has_role(auth.uid(), 'doctor'::user_role)
));