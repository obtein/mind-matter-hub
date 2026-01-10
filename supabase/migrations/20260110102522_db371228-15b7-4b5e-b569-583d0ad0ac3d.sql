-- Create notifications table for in-app notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- 'info', 'reminder', 'warning', 'success'
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  related_patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create appointment_reminders table to track scheduled reminders
CREATE TABLE public.appointment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'email', 'sms', 'in_app'
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Enable RLS on appointment_reminders
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for appointment_reminders (doctors can manage reminders for their appointments)
CREATE POLICY "Doctors can view reminders for their appointments"
ON public.appointment_reminders FOR SELECT
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

CREATE POLICY "Doctors can insert reminders for their appointments"
ON public.appointment_reminders FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

CREATE POLICY "Doctors can update reminders for their appointments"
ON public.appointment_reminders FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

CREATE POLICY "Doctors can delete reminders for their appointments"
ON public.appointment_reminders FOR DELETE
USING (EXISTS (
  SELECT 1 FROM appointments 
  WHERE appointments.id = appointment_reminders.appointment_id 
  AND appointments.doctor_id = auth.uid()
));

-- Create indexes for better performance
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_appointment_reminders_appointment_id ON public.appointment_reminders(appointment_id);
CREATE INDEX idx_appointment_reminders_reminder_time ON public.appointment_reminders(reminder_time);
CREATE INDEX idx_appointment_reminders_is_sent ON public.appointment_reminders(is_sent);