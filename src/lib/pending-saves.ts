/**
 * Edits that are not written yet (e.g. session notes waiting for the autosave delay)
 * register a flush function here. Window close and logout call flushPendingSaves()
 * before they sync and close the database.
 */
type Flush = () => Promise<void>;

const pending = new Set<Flush>();

export function registerPendingSave(flush: Flush): () => void {
  pending.add(flush);
  return () => {
    pending.delete(flush);
  };
}

export async function flushPendingSaves(): Promise<void> {
  await Promise.allSettled([...pending].map((flush) => flush()));
}
