-- 2026-10-12 — close the anon-writable admin tables, remove duplicate permissive
-- policies on patient tables, revoke anon table privileges. Patient-table access rules
-- (doctor_id = auth.uid()::text) are unchanged.
-- Apply from the Supabase SQL editor. Idempotent.

-- 1. Admin membership helper (SECURITY DEFINER avoids RLS recursion on admin_users)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 2. admin_users
drop policy if exists "Anyone can manage admin_users" on public.admin_users;
drop policy if exists "Anyone can read admin_users" on public.admin_users;
drop policy if exists admin_users_select on public.admin_users;
drop policy if exists admin_users_insert on public.admin_users;
drop policy if exists admin_users_delete on public.admin_users;
create policy admin_users_select on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy admin_users_insert on public.admin_users
  for insert to authenticated
  with check (public.is_admin());
create policy admin_users_delete on public.admin_users
  for delete to authenticated
  using (public.is_admin());

-- 3. admin_commands
alter table public.admin_commands add column if not exists issued_by uuid;
drop policy if exists "Anyone can insert commands" on public.admin_commands;
drop policy if exists commands_insert_open on public.admin_commands;
drop policy if exists "Anyone can read commands" on public.admin_commands;
drop policy if exists commands_select_open on public.admin_commands;
drop policy if exists "Anyone can update commands" on public.admin_commands;
drop policy if exists commands_update_open on public.admin_commands;
create policy admin_commands_insert on public.admin_commands
  for insert to authenticated
  with check (public.is_admin());
create policy admin_commands_select on public.admin_commands
  for select to authenticated
  using (public.is_admin() or target_user_id is null or target_user_id = (select auth.uid())::text);
create policy admin_commands_update on public.admin_commands
  for update to authenticated
  using (public.is_admin() or target_user_id is null or target_user_id = (select auth.uid())::text)
  with check (public.is_admin() or target_user_id is null or target_user_id = (select auth.uid())::text);

-- 4. app_logs: anyone may still insert (pre-login crash reports); only admins read
drop policy if exists "Only authenticated can read own logs" on public.app_logs;
drop policy if exists logs_select on public.app_logs;
drop policy if exists "Anyone can insert logs" on public.app_logs;
create policy app_logs_select on public.app_logs
  for select to authenticated
  using (public.is_admin());

-- 5. device_heartbeats: own row only; admins read all
drop policy if exists heartbeats_insert_open on public.device_heartbeats;
drop policy if exists heartbeats_select_open on public.device_heartbeats;
drop policy if exists heartbeats_update_open on public.device_heartbeats;
create policy heartbeats_insert on public.device_heartbeats
  for insert to authenticated
  with check (user_id = (select auth.uid())::text);
create policy heartbeats_update on public.device_heartbeats
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
create policy heartbeats_select on public.device_heartbeats
  for select to authenticated
  using (user_id = (select auth.uid())::text or public.is_admin());

-- 6. patient tables: add the missing reminders UPDATE policy, then drop the duplicate ALL policies
drop policy if exists reminders_update on public.appointment_reminders;
create policy reminders_update on public.appointment_reminders
  for update to authenticated
  using (exists (select 1 from public.appointments a
                 where a.id = appointment_reminders.appointment_id
                   and a.doctor_id = (auth.uid())::text))
  with check (exists (select 1 from public.appointments a
                      where a.id = appointment_reminders.appointment_id
                        and a.doctor_id = (auth.uid())::text));
drop policy if exists patients_doctor_all on public.patients;
drop policy if exists appointments_doctor_all on public.appointments;
drop policy if exists patient_notes_doctor_all on public.patient_notes;
drop policy if exists session_medications_doctor_all on public.session_medications;
drop policy if exists appointment_reminders_doctor_all on public.appointment_reminders;
drop policy if exists notifications_user_all on public.notifications;

-- 7. anon never touches data tables; it may only insert logs
revoke all on table
  public.patients, public.appointments, public.patient_notes, public.session_medications,
  public.appointment_reminders, public.notifications,
  public.admin_commands, public.admin_users, public.device_heartbeats
from anon;
revoke all on table public.app_logs from anon;
grant insert on table public.app_logs to anon;
