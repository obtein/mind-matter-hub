/**
 * Idempotent local migrations, run on every start (after schema.sql on a new database).
 *
 * - deleted_records: tombstones of local deletes. Pushed to the cloud table of the same name;
 *   the pull never re-inserts a tombstoned id (the cloud keeps the row as an archive).
 * - update_updated_at_column: stamp now() only when the writer did not set updated_at
 *   itself. A pull writes the cloud's updated_at and must keep it.
 */
export const LOCAL_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS deleted_records (
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (table_name, record_id)
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;
