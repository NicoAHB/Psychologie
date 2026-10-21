// Version history: encrypted vault snapshots kept next to the live copy, so a deletion or bad edit can be undone.
// Snapshots hold the same ciphertext as the vault itself (no plaintext, images stay shared), at most one per window.
import { metaDelete, metaGet, metaPut } from './db';
import type { VaultEnvelope } from './types';

export const SNAPSHOT_WINDOW_MS = 10 * 60 * 1000;
export const SNAPSHOT_LIMIT = 30;
export interface SnapshotEntry { at: number; reason: 'auto' | 'delete' }
const indexKey = (vault: string) => `snapshots:${vault}`;
const itemKey = (vault: string, at: number) => `snapshot:${vault}:${at}`;

export const listSnapshots = async (vault: string) => ((await metaGet<SnapshotEntry[]>(indexKey(vault))) ?? []).sort((a, b) => b.at - a.at);
export async function readSnapshot(vault: string, at: number) { return metaGet<VaultEnvelope>(itemKey(vault, at)); }
/** Keep `previous` (the state about to be replaced) unless a snapshot already exists within the window; `force` always keeps one. */
export async function recordSnapshot(previous: VaultEnvelope, force = false, now = Date.now()) {
  const entries = await listSnapshots(previous.vaultId);
  if (!force && entries[0] && now - entries[0].at < SNAPSHOT_WINDOW_MS) return;
  if (entries[0]?.at === now) return;
  await metaPut(itemKey(previous.vaultId, now), previous);
  const next = [{ at: now, reason: force ? 'delete' : 'auto' } as SnapshotEntry, ...entries];
  // Deletion snapshots are rarer and more valuable, so they outlive routine ones when the limit is reached.
  const keep = new Set(next.slice(0, SNAPSHOT_LIMIT).map(e => e.at));
  for (const entry of next.filter(e => !keep.has(e.at))) await metaDelete(itemKey(previous.vaultId, entry.at));
  await metaPut(indexKey(previous.vaultId), next.filter(e => keep.has(e.at)));
}
export async function clearSnapshots(vault: string) {
  for (const entry of await listSnapshots(vault)) await metaDelete(itemKey(vault, entry.at));
  await metaDelete(indexKey(vault));
}
