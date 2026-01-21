-- Fix profiles table RLS policies - make PERMISSIVE with TO authenticated
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create new PERMISSIVE policies with TO authenticated for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- Fix patients table RLS policies - make PERMISSIVE with TO authenticated
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