import type { SupabaseClient } from '@supabase/supabase-js';
import type { EncryptedBlob, RemoteVault, VaultData, VaultEnvelope } from './types';
import { readBlob, writeBlob, getRevision, setRevision, getRemovals, setRemovals } from './db';
import { encryptReminder } from './crypto';
import { appointmentInstant, clientZone, reminderExpiration, reminderInstant } from './dates';
import { referencedBlobs } from './blobs';
export { referencedBlobs };
// Set by vite.config.ts; undefined under the Node test runner, which has no `import.meta.env` either.
declare const __CLOUD_CONFIGURED__: boolean | undefined;
const env: Partial<Record<string, string>> = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
export const cloudConfigured = typeof __CLOUD_CONFIGURED__ === 'undefined' ? false : __CLOUD_CONFIGURED__;
export const reminderPublicKey: string = env.VITE_REMINDER_PUBLIC_KEY || '';
const BUCKET = 'encrypted-notes';
// The Supabase client is a separate chunk that is only fetched once the cloud is actually used.
let client: Promise<SupabaseClient | null> | undefined;
// Without build-time configuration this is `null`, so the bundler drops the Supabase chunk (and its offline precache) entirely.
const load = cloudConfigured ? () => import('@supabase/supabase-js').then(m => m.createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })) : null;
export function getCloud(): Promise<SupabaseClient | null> {
  if (!client && !load) return Promise.resolve(null);
  return client ??= load!();
}
/** Test hook: substitute a fake Supabase client. */
export function overrideCloud(fake: unknown) { client = Promise.resolve(fake as SupabaseClient); }
async function requireCloud() { const cloud = await getCloud(); if (!cloud) throw new Error('cloudMissing'); return cloud; }
export function cloudError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (msg.includes('DIFFERENT_VAULT')) return 'differentVault';
  if (msg.includes('SYNC_CONFLICT')) return 'syncConflict';
  if (/Invalid login credentials|Email not confirmed|invalid_credentials/i.test(msg)) return 'authError';
  if (/Failed to fetch|fetch failed|NetworkError|network/i.test(msg)) return 'networkError';
  if (['authError', 'differentVault', 'noRemote', 'cloudMissing', 'reminderKeyMissing', 'storageError'].includes(msg)) return msg;
  return 'syncError';
}
export async function currentUser() {
  const cloud = await requireCloud();
  const { data, error } = await cloud.auth.getUser();
  if (error || !data.user) throw new Error('authError');
  return data.user;
}
export async function fetchRemote(): Promise<RemoteVault | null> {
  const user = await currentUser(); const cloud = await requireCloud();
  const { data, error } = await cloud.from('encrypted_vaults').select('vault_id,salt,payload,revision').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}
/** Key wraps travel inside the payload object, so the existing table columns and RPC signature stay unchanged. */
export const remoteEnvelope = (r: RemoteVault): VaultEnvelope => {
  const { wraps, ...payload } = r.payload;
  return { format: wraps ? 'praxisraum-v2' : 'praxisraum-v1', iterations: 600000, vaultId: r.vault_id, salt: r.salt, payload, ...wraps && { wraps } };
};
export async function downloadBlob(vaultId: string, id: string): Promise<EncryptedBlob> {
  const user = await currentUser(); const cloud = await requireCloud();
  const { data, error } = await cloud.storage.from(BUCKET).download(`${user.id}/${vaultId}/${id}.json`);
  if (error) throw error;
  const blob = JSON.parse(await data.text()) as EncryptedBlob;
  if (blob.id !== id || blob.vaultId !== vaultId) throw new Error('storageError');
  await writeBlob(blob);
  return blob;
}
/** File names (`<image id>.json`) already stored for this vault; one listing replaces re-uploading every image on every sync. */
async function storedImages(cloud: SupabaseClient, folder: string) {
  const names = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await cloud.storage.from(BUCKET).list(folder, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of data) names.add(entry.name);
    if (data.length < 1000) return names;
  }
}
export async function syncVault(envelope: VaultEnvelope, data: VaultData) {
  const cloud = await requireCloud(); const user = await currentUser();
  const expected = await getRevision(user.id, envelope.vaultId);
  const remote = await fetchRemote();
  if (remote && remote.vault_id !== envelope.vaultId) throw new Error('differentVault');
  if ((remote?.revision ?? 0) !== expected) throw new Error('SYNC_CONFLICT');
  const folder = `${user.id}/${envelope.vaultId}`; const stored = await storedImages(cloud, folder);
  for (const id of referencedBlobs(data)) {
    if (stored.has(`${id}.json`)) continue;
    const blob = await readBlob(id);
    if (!blob) { await downloadBlob(envelope.vaultId, id); continue; }
    if (blob.vaultId !== envelope.vaultId) throw new Error('storageError');
    const { error } = await cloud.storage.from(BUCKET).upload(`${folder}/${id}.json`, new Blob([JSON.stringify(blob)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    if (error) throw error;
  }
  const { data: revision, error } = await cloud.rpc('save_encrypted_vault', { p_expected_revision: expected, p_vault_id: envelope.vaultId, p_salt: envelope.salt, p_payload: envelope.wraps ? { ...envelope.payload, wraps: envelope.wraps } : envelope.payload });
  if (error) throw error;
  await setRevision(user.id, envelope.vaultId, revision);
  const jobs = [];
  if (data.settings.remindersEnabled) {
    if (!reminderPublicKey) throw new Error('reminderKeyMissing');
    for (const appointment of data.appointments.filter(a => a.status === 'scheduled')) {
      const client = data.clients.find(c => c.id === appointment.clientId);
      const expires = reminderExpiration(appointment);
      if (new Date(expires).getTime() <= Date.now()) continue;
      const advisorChatId = data.settings.advisorChatId;
      const clientChatId = client?.reminderConsent ? client.telegramChatId : '';
      if (!advisorChatId && !clientChatId) continue;
      // The worker receives the exact instant plus both zones and words the message itself, so nobody has to convert times.
      jobs.push({ id: appointment.reminderId, due_at: reminderInstant(appointment), expires_at: expires,
        payload: await encryptReminder(reminderPublicKey, { advisorChatId, clientChatId, language: client?.language ?? 'de', startsAt: appointmentInstant(appointment),
          advisorTimeZone: data.settings.timeZone, clientTimeZone: clientZone(client, data.settings) }, appointment.reminderId) });
    }
  }
  const { error: reminderError } = await cloud.rpc('replace_reminder_jobs', { p_jobs: jobs });
  if (reminderError) throw reminderError;
  // Only after the new vault state is saved may deleted images leave the cloud (right to erasure).
  const removals = await getRemovals(envelope.vaultId); const live = new Set(referencedBlobs(data));
  const doomed = [...removals].filter(id => !live.has(id));
  if (doomed.length) {
    const { error: removeError } = await cloud.storage.from(BUCKET).remove(doomed.map(id => `${folder}/${id}.json`));
    if (removeError) throw removeError;
  }
  if (removals.size) await setRemovals(envelope.vaultId, new Set());
}
