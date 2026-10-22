export const AUTO_LOCK_MINUTES = [5, 10, 15, 30, 60, 90] as const;
export function autoLockMinutes(value?: number): number { return AUTO_LOCK_MINUTES.some(minutes => minutes === value) ? value! : 10; }

// Stop capture/playback synchronously before a lock waits for pending encrypted writes.
// Callbacks own only transient browser media and blob URLs, never stored patient files.
const memoMedia = new Set<() => void>();
export function registerMemoMedia(stop: () => void): () => void { memoMedia.add(stop); return () => { memoMedia.delete(stop); }; }
export function stopMemoMedia(): void { for (const stop of [...memoMedia]) { try { stop(); } catch { /* Continue stopping the other media handles. */ } } }
