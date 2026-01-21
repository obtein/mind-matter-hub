-- Drop existing RESTRICTIVE policies on patients table
DROP POLICY IF EXISTS "Doctors can view their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can insert their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can update their own patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can delete their own patients" ON public.patients;

-- Create new PERMISSIVE policies with TO authenticated for patients
CREATE POLICY "Doctors can view their own patients" 
ON public.patients 
FOR SELECT 
TO authenticated
USING ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can insert their own patients" 
ON public.patients 
FOR INSERT 
TO authenticated
WITH CHECK ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own patients" 
ON public.patients 
FOR UPDATE 
TO authenticated
USING ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own patients" 
ON public.patients 
FOR DELETE 
TO authenticated
USING ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));

-- Drop existing RESTRICTIVE policies on appointments table
DROP POLICY IF EXISTS "Doctors can view their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can insert their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can update their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can delete their own appointments" ON public.appointments;

-- Create new PERMISSIVE policies with TO authenticated for appointments
CREATE POLICY "Doctors can view their own appointments" 
ON public.appointments 
FOR SELECT 
TO authenticated
USING ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can insert their own appointments" 
ON public.appointments 
FOR INSERT 
TO authenticated
WITH CHECK ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can update their own appointments" 
ON public.appointments 
FOR UPDATE 
TO authenticated
USING ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));

CREATE POLICY "Doctors can delete their own appointments" 
ON public.appointments 
FOR DELETE 
TO authenticated
USING ((auth.uid() = doctor_id) AND has_role(auth.uid(), 'doctor'::user_role));