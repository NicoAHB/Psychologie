import { metaGet, metaPut } from './db';
import type { EmailStatus } from './emailSettings';
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 8640000000000000;
export interface BackupProof { checkedAt?: number; recoveryConfirmedAt?: number }
export async function readBackupProof(vault: string): Promise<BackupProof> {
  const [checkedAt, recoveryConfirmedAt] = await Promise.all([metaGet<number>(`backup-check:${vault}`), metaGet<number>(`backup-recovery:${vault}`)]);
  return { ...(validTime(checkedAt) && { checkedAt }), ...(validTime(recoveryConfirmedAt) && { recoveryConfirmedAt }) };
}
/** Dates only: never filenames, passwords, counts or decrypted contents in metadata. */
export async function markBackupProof(vault: string, kind: 'check' | 'recovery', at = Date.now()) {
  if (!vault || !validTime(at)) throw new Error('storageError');
  await metaPut(`backup-${kind}:${vault}`, at);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('praxisraum-backup-proof'));
}
export interface EmailProof { fingerprint: string; acceptedAt: number; confirmedAt?: number }
export async function emailFingerprint(user: string, status: EmailStatus): Promise<string> {
  const value = JSON.stringify([user, status.provider, status.endpoint, status.senderEmail, status.senderName, status.enabled, status.updatedAt ?? '']);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function readEmailProof(user: string, fingerprint: string): Promise<EmailProof | undefined> {
  const value = await metaGet<EmailProof>(`email-proof:${user}`);
  if (!value || value.fingerprint !== fingerprint || !validTime(value.acceptedAt)) return;
  return { fingerprint, acceptedAt: value.acceptedAt, ...(validTime(value.confirmedAt) && { confirmedAt: value.confirmedAt }) };
}
export async function markEmailProof(user: string, fingerprint: string, acceptedAt: number, confirmedAt?: number) {
  if (!user || !/^[0-9a-f]{64}$/.test(fingerprint) || !validTime(acceptedAt) || confirmedAt !== undefined && !validTime(confirmedAt)) throw new Error('storageError');
  await metaPut(`email-proof:${user}`, { fingerprint, acceptedAt, ...(confirmedAt !== undefined && { confirmedAt }) });
}
