import { metaGet, metaPut } from './db';
export type BackupKind = 'download' | 'auto' | 'cloud' | 'share';
export interface BackupState { at: number; kind: BackupKind }
const key = (vault: string) => `backup:${vault}`;
export const readBackupState = (vault: string) => metaGet<BackupState>(key(vault));
export async function markBackup(vault: string, kind: BackupKind, at = Date.now()) {
  await metaPut(key(vault), { at, kind } satisfies BackupState);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('praxisraum-backup')); // lets the reminder banner refresh itself
}
export const BACKUP_MAX_AGE_DAYS = 7;
/**
 * Whether the practitioner should be nudged to make a copy outside this device: nothing was ever saved elsewhere,
 * or the last copy is old *and* something changed since. `latestChange` is the newest record stamp (0 if none).
 */
export function backupNeeded(state: BackupState | undefined, latestChange: number, hasData: boolean, now = Date.now()): { needed: boolean; days: number } {
  if (!hasData) return { needed: false, days: 0 };
  if (!state) return { needed: true, days: 0 };
  const days = Math.floor((now - state.at) / 864e5);
  return { needed: days >= BACKUP_MAX_AGE_DAYS && latestChange > state.at, days };
}
export function latestChange(data: { clients: { updatedAt?: number }[]; appointments: { updatedAt?: number }[]; sessions: { updatedAt?: number }[]; notes: { updatedAt?: number }[]; invoices: { updatedAt?: number }[]; assessments?: { updatedAt?: number }[]; templates?: { updatedAt?: number }[]; documents?: { updatedAt?: number }[]; availability?: { updatedAt?: number }[] }) {
  return Math.max(0, ...[data.clients, data.appointments, data.sessions, data.notes, data.invoices, data.assessments ?? [], data.templates ?? [], data.documents ?? [], data.availability ?? []].flat().map(r => r.updatedAt ?? 0));
}
export const hasRecords = (data: { clients: unknown[]; sessions: unknown[]; notes: unknown[]; availability?: unknown[] }) => data.clients.length + data.sessions.length + data.notes.length + (data.availability?.length ?? 0) > 0;
