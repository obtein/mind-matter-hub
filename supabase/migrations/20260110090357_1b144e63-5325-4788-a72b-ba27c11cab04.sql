-- session_medications'ı appointments tablosuna bağla
ALTER TABLE public.session_medications 
  DROP CONSTRAINT session_medications_session_id_fkey;

ALTER TABLE public.session_medications 
  RENAME COLUMN session_id TO appointment_id;

ALTER TABLE public.session_medications 
  ADD CONSTRAINT session_medications_appointment_id_fkey 
  FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

-- session_medications için RLS politikalarını güncelle
DROP POLICY IF EXISTS "Doctors can delete medications for their sessions" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can insert medications for their sessions" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can update medications for their sessions" ON public.session_medications;
DROP POLICY IF EXISTS "Doctors can view medications for their sessions" ON public.session_medications;

CREATE POLICY "Doctors can view medications for their appointments" 
ON public.session_medications FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

CREATE POLICY "Doctors can insert medications for their appointments" 
ON public.session_medications FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

CREATE POLICY "Doctors can update medications for their appointments" 
ON public.session_medications FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

CREATE POLICY "Doctors can delete medications for their appointments" 
ON public.session_medications FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = session_medications.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

-- sessions tablosunu sil
DROP TABLE IF EXISTS public.sessions CASCADE;