-- Bug hunt 2026-11-27 (docs/work-notes/bug-hunt, local only). Idempotent.

-- H2: tombstones of rows deleted on the device. The deleted rows stay in their tables as an
-- archive; the app never pulls an id listed here back into the device database.
create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  doctor_id text not null,
  table_name text not null check (table_name in (
    'patients', 'appointments', 'patient_notes', 'session_medications',
    'appointment_reminders', 'notifications')),
  record_id uuid not null,
  deleted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (doctor_id, table_name, record_id)
);
alter table public.deleted_records enable row level security;
revoke all on table public.deleted_records from anon, authenticated;
grant select, insert on table public.deleted_records to authenticated;
drop policy if exists deleted_records_select on public.deleted_records;
create policy deleted_records_select on public.deleted_records
  for select to authenticated using (doctor_id = (select auth.uid())::text);
drop policy if exists deleted_records_insert on public.deleted_records;
create policy deleted_records_insert on public.deleted_records
  for insert to authenticated with check (doctor_id = (select auth.uid())::text);

-- L3: a non-admin may only acknowledge a command (status, executed_at), never rewrite its
-- type/payload/target or set it back to pending.
revoke update on table public.admin_commands from authenticated;
grant update (status, executed_at) on table public.admin_commands to authenticated;
drop policy if exists admin_commands_update on public.admin_commands;
create policy admin_commands_update on public.admin_commands
  for update to authenticated
  using (public.is_admin() or target_user_id is null or target_user_id = (select auth.uid())::text)
  with check (
    public.is_admin()
    or ((target_user_id is null or target_user_id = (select auth.uid())::text)
        and status in ('executed', 'expired', 'failed', 'unsupported'))
  );

-- M6: anonymous log inserts stay possible (pre-login crash reports) but are size-limited;
-- admins can prune the table.
alter table public.app_logs drop constraint if exists app_logs_size_limit;
alter table public.app_logs add constraint app_logs_size_limit check (
  char_length(message) <= 2000
  and (context is null or pg_column_size(context) <= 8192)
  and (user_email is null or char_length(user_email) <= 320)
  and char_length(level) <= 16
) not valid;
drop policy if exists app_logs_delete on public.app_logs;
create policy app_logs_delete on public.app_logs
  for delete to authenticated using (public.is_admin());

-- Advisor 0028: anon does not need is_admin().
revoke execute on function public.is_admin() from anon;
