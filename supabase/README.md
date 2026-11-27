# Supabase schema notes

Live project: `vhdhwnvfomwzauvqozxo` ("PsiTrak"), created 2026-03-21.

## Which migrations are real

- The files dated `202601*` in `migrations/` come from the original Lovable Cloud project
  (UUID `doctor_id`, `has_role()`). They were **not** applied to the live project and do
  not describe it. They are kept for history only.
- The live schema was created from the Supabase dashboard in March 2026. The applied
  migrations there are: `create_psitrak_tables`, `enable_rls_policies`,
  `disable_rls_for_single_user`, `add_meslek_column`, `create_app_logs_table`,
  `create_admin_tables`. Their SQL is not in this repository.
- Files dated `202610*` and later are written by hand and are the source of truth going
  forward.

## Applied: `20261012150000_lock_admin_tables_and_dedupe_policies.sql`

Applied by hand from the SQL editor (it is live; verified 2026-11-27 with the query below). It
is not listed by `list_migrations` because it did not go through the migration tool.

```sql
select tablename, policyname, roles::text, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by 1, 4, 2;
```

What the lockdown changed:

| Table | Before | After |
|---|---|---|
| `admin_commands` | anon may insert, read, update anything | admins insert; the target user (or everyone, for broadcast) reads and updates |
| `admin_users` | anon may insert, read, delete anything | self or admin reads; admins insert and delete |
| `device_heartbeats` | anon may insert, read, update anything | own row only; admins read all |
| `app_logs` | any logged-in user reads everything | admins read; anyone may still insert (pre-login crash reports) |
| patient tables | duplicate ALL + per-command policies | per-command policies only (adds the missing `reminders_update`) |
| grants | `anon` has full privileges on every table | `anon` keeps INSERT on `app_logs` only |

Clients send the user's session token for every request since app version 0.7.6, so
this lockdown does not affect the desktop app. Clients older than 0.7.6 lose only the
heartbeat until they update.

## Applied: `20261127144626_bug_hunt_hardening.sql`

Applied 2026-11-27 with the Supabase MCP `apply_migration` (listed by `list_migrations`):
`deleted_records` tombstones (deleted rows stay as an archive, the app never pulls them back);
non-admins may only set `status`/`executed_at` on `admin_commands` to
executed/expired/failed/unsupported; `app_logs_size_limit` (NOT VALID) and an admin DELETE
policy on `app_logs`; `is_admin()` no longer executable by `anon`.
