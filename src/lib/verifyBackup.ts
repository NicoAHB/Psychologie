import { decryptBytes, decryptVault, deriveKey, importDataKey, passphraseSalt, unwrapDataKey, validateEnvelope } from './crypto';
import { referencedBlobs } from './blobs';
import type { EncryptedBlob, VaultEnvelope } from './types';
export interface BackupCheck { clients: number; sessions: number; drafts: number; files: number }
/** A non-destructive recovery rehearsal: no IndexedDB writes, no network, no active-vault key. */
export async function verifyBackup(value: unknown, passphrase: string): Promise<BackupCheck> {
  const backup = value as { type?: string; envelope: VaultEnvelope; blobs?: EncryptedBlob[] };
  if (!backup || backup.type !== 'praxisraum-backup-v1' || !Array.isArray(backup.blobs)) throw new Error('invalidBackup');
  validateEnvelope(backup.envelope);
  const env = backup.envelope;
  let key = await deriveKey(passphrase, passphraseSalt(env));
  if (env.format === 'praxisraum-v2') { const raw = await unwrapDataKey(key, env.wraps!.passphrase, env.vaultId, 'passphrase'); try { key = await importDataKey(raw); } finally { raw.fill(0); } }
  const data = await decryptVault(key, env), files = new Map<string, EncryptedBlob>();
  for (const blob of backup.blobs) {
    if (!blob || blob.vaultId !== env.vaultId || typeof blob.id !== 'string' || files.has(blob.id)) throw new Error('invalidBackup');
    files.set(blob.id, blob);
  }
  const expected = referencedBlobs(data);
  if (expected.some(id => !files.has(id))) throw new Error('invalidBackup');
  for (const [id, blob] of files) { const bytes = await decryptBytes(key, blob.payload, `praxisraum-blob:v1:${env.vaultId}:${id}`); bytes.fill(0); }
  return { clients: data.clients.length, sessions: data.sessions.length, drafts: data.sessionDrafts.length, files: files.size };
}
