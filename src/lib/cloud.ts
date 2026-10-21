import { createClient } from '@supabase/supabase-js';
import type { EncryptedBlob, RemoteVault, VaultData, VaultEnvelope } from './types';
import { readBlob, writeBlob, getRevision, setRevision } from './db';
import { encryptReminder } from './crypto';
import { appointmentInstant, reminderInstant } from './dates';
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const cloud = url && anon ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
export const reminderPublicKey: string = import.meta.env.VITE_REMINDER_PUBLIC_KEY || '';
export function cloudError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (msg.includes('SYNC_CONFLICT')) return 'syncConflict';
  if (/Invalid login credentials|Email not confirmed|invalid_credentials/i.test(msg)) return 'authError';
  if (/Failed to fetch|fetch failed|NetworkError|network/i.test(msg)) return 'networkError';
  if (['differentVault', 'noRemote', 'cloudMissing', 'reminderKeyMissing', 'storageError'].includes(msg)) return msg;
  return 'syncError';
}
export async function currentUser() {
  if (!cloud) throw new Error('cloudMissing');
  const { data, error } = await cloud.auth.getUser();
  if (error || !data.user) throw new Error('authError');
  return data.user;
}
export async function fetchRemote(): Promise<RemoteVault | null> {
  const user = await currentUser();
  const { data, error } = await cloud!.from('encrypted_vaults').select('vault_id,salt,payload,revision').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}
export const remoteEnvelope = (r: RemoteVault): VaultEnvelope => ({ format: 'praxisraum-v1', iterations: 600000, vaultId: r.vault_id, salt: r.salt, payload: r.payload });
export function referencedBlobs(data: VaultData) {
  return [...new Set([...data.clients.flatMap(c => c.avatarId ? [c.avatarId] : []), ...data.notes.map(n => n.blobId)])];
}
export async function downloadBlob(vaultId: string, id: string): Promise<EncryptedBlob> {
  const user = await currentUser();
  const { data, error } = await cloud!.storage.from('encrypted-notes').download(`${user.id}/${vaultId}/${id}.json`);
  if (error) throw error;
  const blob = JSON.parse(await data.text()) as EncryptedBlob;
  if (blob.id !== id || blob.vaultId !== vaultId) throw new Error('storageError');
  await writeBlob(blob);
  return blob;
}
export async function syncVault(envelope: VaultEnvelope, data: VaultData, persistAttachments = true) {
  const user = await currentUser();
  const expected = await getRevision(user.id, envelope.vaultId);
  const remote = await fetchRemote();
  if (remote && remote.vault_id !== envelope.vaultId) throw new Error('differentVault');
  if ((remote?.revision ?? 0) !== expected) throw new Error('SYNC_CONFLICT');
  for (const id of referencedBlobs(data)) {
    const blob = await readBlob(id);
    if (!blob) { await downloadBlob(envelope.vaultId, id); continue; }
    if (blob.vaultId !== envelope.vaultId) throw new Error('storageError');
    const { error } = await cloud!.storage.from('encrypted-notes').upload(`${user.id}/${envelope.vaultId}/${id}.json`, new Blob([JSON.stringify(blob)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    if (error) throw error;
  }
  const { data: revision, error } = await cloud!.rpc('save_encrypted_vault', { p_expected_revision: expected, p_vault_id: envelope.vaultId, p_salt: envelope.salt, p_payload: envelope.payload });
  if (error) throw error;
  await setRevision(user.id, envelope.vaultId, revision);
  const jobs = [];
  if (data.settings.remindersEnabled) {
    if (!reminderPublicKey) throw new Error('reminderKeyMissing');
    for (const appointment of data.appointments.filter(a => a.status === 'scheduled')) {
      const client = data.clients.find(c => c.id === appointment.clientId);
      const expires = appointmentInstant(appointment);
      if (new Date(expires).getTime() <= Date.now()) continue;
      const advisorChatId = data.settings.advisorChatId;
      const clientChatId = client?.reminderConsent ? client.telegramChatId : '';
      if (!advisorChatId && !clientChatId) continue;
      jobs.push({ id: appointment.reminderId, due_at: reminderInstant(appointment), expires_at: expires,
        payload: await encryptReminder(reminderPublicKey, { advisorChatId, clientChatId, language: client?.language ?? 'de', time: appointment.time, timeZone: appointment.timeZone }, appointment.reminderId) });
    }
  }
  const { error: reminderError } = await cloud!.rpc('replace_reminder_jobs', { p_jobs: jobs });
  if (reminderError) throw reminderError;
  void persistAttachments;
}
