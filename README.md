# PsiTrak — Hasta Takip Sistemi

Desktop patient-tracking application for a psychiatry practice. Windows app built with
Tauri v2; the UI is React + Vite + shadcn/Tailwind. All patient data lives in a local
PGlite (Postgres-in-WebAssembly) database on the device and is mirrored to Supabase as a
cloud copy. The UI is Turkish.

## Architecture

| Layer | Where | Notes |
|---|---|---|
| UI | `src/pages`, `src/components/dashboard` | Views: daily schedule, patients, patient detail, appointment detail, statistics, medication report |
| View models | `src/viewmodels` | One hook per view; all mutations go through repositories |
| Repositories | `src/repositories` | Thin pass-throughs to the `DbService` |
| Local database | `src/services/db.pglite.ts`, `src/services/pglite/` | PGlite in IndexedDB, one database per user (`idb://psitrak_{userId}`). Schema in `pglite/schema.sql`, startup migrations in `pglite/init.ts` |
| Auth | `src/services/auth.supabase.ts` | Supabase Auth, email + password |
| Cloud sync | `src/services/supabase-sync.ts`, `src/services/sync-utils.ts` | See below |
| Device services | `src/services/heartbeat.ts`, `command-listener.ts`, `remote-logger.ts` | Heartbeat every 2 min, admin command polling every 30 s, error log to `app_logs` |
| Desktop host | `src-tauri/` | Tauri v2, single instance, autostart, updater, silent-update scheduled task (`lib.rs`) |
| Updates | `.github/workflows/build-desktop.yml` | Tag `v*` builds, signs and publishes a GitHub Release with `latest.json`; the app polls it on start |

The admin console lives in a separate repository: `obtein/mind-matter-hub-admin`.

### Sync model

The device is the primary copy. Supabase is the cloud copy.

- `syncToSupabase()` pushes every local row (on window close and on logout).
- `syncFromSupabase()` pulls rows that are missing locally or strictly newer in the cloud
  (by `updated_at`), then pushes every local row. Runs on first start, after a failed
  close-sync (`psitrak_pending_sync`), and from the "Verileri Senkronize Et" button.
- Uploads go in chunks of 200. A failing chunk is retried row by row, so one bad record
  never blocks the rest. Failures are reported to the user and logged to `app_logs`.
- Date values are normalised in `sync-utils.ts` (`sanitizeRow`): Postgres accepts years
  1..9999 only; anything else becomes `null`.

## Development

```sh
npm ci
npm run dev            # web build on http://localhost:8080
npm run dev:desktop    # Tauri window (needs Rust toolchain)
npm run typecheck
npm run lint
npm test               # vitest, unit tests for sync and validation helpers
```

Environment variables (`.env`, Vite-prefixed):

```
VITE_SUPABASE_PROJECT_ID=...
VITE_SUPABASE_PUBLISHABLE_KEY=...   # anon key; public by design, access is enforced by RLS
VITE_SUPABASE_URL=https://....supabase.co
```

## Release procedure

1. Bump the version in **all three** files: `package.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` (and `src-tauri/Cargo.lock`, package `app`).
2. Commit, then tag `vX.Y.Z` and push the tag.
3. The workflow verifies that the tag equals the version files, runs type-check, lint
   and tests, builds and signs the MSI, and publishes the release with `latest.json`.
4. Installed clients pick the update up on their next start.

Never reuse a tag. A tag whose version does not match the files is rejected by CI
(a mismatch republished into an old release once, on 2026-04-13).

## Supabase

Project `vhdhwnvfomwzauvqozxo`. See `supabase/README.md` for the schema history and the
policy migration that must be applied by hand.

## Known limits

- `appointment_reminders` rows are written but never sent; in-app reminders use a fixed
  24-hour window (`NotificationBell.tsx`).
- The silent-update path (`src-tauri/src/lib.rs`) installs the downloaded MSI through a
  scheduled task without verifying its signature. The fallback path through
  `tauri-plugin-updater` does verify.
- `fs:scope` in `src-tauri/capabilities/default.json` is the whole filesystem.
