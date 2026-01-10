-- Patients tablosuna yeni alanlar ekle
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS emergency_phone text,
ADD COLUMN IF NOT EXISTS tc_identity text;

-- Sessions (Seanslar) tablosu oluştur
CREATE TABLE public.sessions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    doctor_id uuid NOT NULL,
    session_date timestamp with time zone NOT NULL DEFAULT now(),
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Session Medications (Seans İlaçları) tablosu oluştur
CREATE TABLE public.session_medications (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    medication_name text NOT NULL,
    dosage text,
    instructions text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS'i etkinleştir
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_medications ENABLE ROW LEVEL SECURITY;

-- Sessions için RLS politikaları
CREATE POLICY "Doctors can view their own sessions" 
ON public.sessions 
FOR SELECT 
USING (auth.uid() = doctor_id);

CREATE POLICY "Doctors can insert their own sessions" 
ON public.sessions 
FOR INSERT 
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Doctors can update their own sessions" 
ON public.sessions 
FOR UPDATE 
USING (auth.uid() = doctor_id);

CREATE POLICY "Doctors can delete their own sessions" 
ON public.sessions 
FOR DELETE 
USING (auth.uid() = doctor_id);

-- Session medications için RLS politikaları (session üzerinden doctor_id kontrolü)
CREATE POLICY "Doctors can view medications for their sessions" 
ON public.session_medications 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.sessions 
        WHERE sessions.id = session_medications.session_id 
        AND sessions.doctor_id = auth.uid()
    )
);

CREATE POLICY "Doctors can insert medications for their sessions" 
ON public.session_medications 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.sessions 
        WHERE sessions.id = session_medications.session_id 
        AND sessions.doctor_id = auth.uid()
    )
);

CREATE POLICY "Doctors can update medications for their sessions" 
ON public.session_medications 
FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.sessions 
        WHERE sessions.id = session_medications.session_id 
        AND sessions.doctor_id = auth.uid()
    )
);

CREATE POLICY "Doctors can delete medications for their sessions" 
ON public.session_medications 
FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM public.sessions 
        WHERE sessions.id = session_medications.session_id 
        AND sessions.doctor_id = auth.uid()
    )
);

-- Appointments tablosuna duration_minutes varsayılan değerini 60 yap
ALTER TABLE public.appointments ALTER COLUMN duration_minutes SET DEFAULT 60;

-- Updated_at trigger'ları
CREATE TRIGGER update_sessions_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();