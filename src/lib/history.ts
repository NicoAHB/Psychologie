// Version history: encrypted vault snapshots kept next to the live copy, so a deletion or bad edit can be undone.
// Snapshots hold the same ciphertext as the vault itself (no plaintext, images stay shared), at most one per window.
import { database, metaDelete, metaGet, metaPut } from './db';
import type { VaultEnvelope } from './types';

export const SNAPSHOT_WINDOW_MS = 10 * 60 * 1000;
export const SNAPSHOT_LIMIT = 30;
export interface SnapshotEntry { at: number; reason: 'auto' | 'delete' | 'checkpoint'; blobIds?: string[] }
const indexKey = (vault: string) => `snapshots:${vault}`;
const itemKey = (vault: string, at: number) => `snapshot:${vault}:${at}`;

export const listSnapshots = async (vault: string) => ((await metaGet<SnapshotEntry[]>(indexKey(vault))) ?? []).sort((a, b) => b.at - a.at);
export async function readSnapshot(vault: string, at: number) { return metaGet<VaultEnvelope>(itemKey(vault, at)); }
/** Keep `previous` (the state about to be replaced) unless a snapshot already exists within the window; `force` always keeps one. */
export async function recordSnapshot(previous: VaultEnvelope, force = false, now = Date.now(), blobIds: string[] = []) {
  const entries = await listSnapshots(previous.vaultId);
  if (!force && entries[0] && now - entries[0].at < SNAPSHOT_WINDOW_MS) return;
  if (entries[0]?.at === now) return;
  await metaPut(itemKey(previous.vaultId, now), previous);
  const next = [{ at: now, reason: force ? 'delete' : 'auto', blobIds } as SnapshotEntry, ...entries];
  // Deletion snapshots are rarer and more valuable, so they outlive routine ones when the limit is reached.
  const keep = new Set(next.slice(0, SNAPSHOT_LIMIT).map(e => e.at));
  for (const entry of next.filter(e => !keep.has(e.at))) await metaDelete(itemKey(previous.vaultId, entry.at));
  await metaPut(indexKey(previous.vaultId), next.filter(e => keep.has(e.at)));
}
/** Commit the live ciphertext and its recovery point atomically, including on Safari/iPadOS. No unload timer needed. */
export async function commitVaultSnapshot(envelope: VaultEnvelope, blobIds: string[], now = Date.now()): Promise<string[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['vault', 'meta'], 'readwrite'); const meta = tx.objectStore('meta');
    const request = meta.get(indexKey(envelope.vaultId)); let discarded: string[] = [];
    request.onsuccess = () => {
      const entries = (request.result ?? []) as SnapshotEntry[];
      const at = Math.max(now, ...entries.map(entry => entry.at + 1));
      const superseded = entries.filter(entry => entry.reason === 'checkpoint' && Math.floor(at / SNAPSHOT_WINDOW_MS) === Math.floor(entry.at / SNAPSHOT_WINDOW_MS));
      const next: SnapshotEntry[] = [{ at, reason: 'checkpoint', blobIds }, ...entries.filter(entry => !superseded.includes(entry))];
      const keep = next.slice(0, SNAPSHOT_LIMIT); const removed = [...superseded, ...next.slice(SNAPSHOT_LIMIT)];
      const liveIds = new Set(keep.flatMap(entry => entry.blobIds ?? []));
      discarded = [...new Set(removed.flatMap(entry => entry.blobIds ?? []))].filter(id => !liveIds.has(id));
      for (const entry of removed) meta.delete(itemKey(envelope.vaultId, entry.at));
      meta.put(envelope, itemKey(envelope.vaultId, at)); meta.put(keep, indexKey(envelope.vaultId));
      tx.objectStore('vault').put(envelope, 'primary');
    };
    tx.oncomplete = () => resolve(discarded);
    tx.onerror = () => reject(tx.error ?? new Error('storageError'));
    tx.onabort = () => reject(tx.error ?? new Error('storageError'));
  });
}
export async function historyBlobIds(vault: string) { return new Set((await listSnapshots(vault)).flatMap(entry => entry.blobIds ?? [])); }
export async function clearSnapshots(vault: string) {
  for (const entry of await listSnapshots(vault)) await metaDelete(itemKey(vault, entry.at));
  await metaDelete(indexKey(vault));
}
