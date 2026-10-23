import { cloudConfigured, currentUser, getCloud } from './cloud';
import { metaGet, updateMetaSet } from './db';
import { SHARE_MAX_CIPHER_CHARS, type SharePacket } from './documentShareCrypto';
export { cloudConfigured as documentSharesConfigured };
const loadGuestSdk = cloudConfigured ? () => import('@supabase/supabase-js') : null;
export interface RemoteShare { id: string; expires_at: string; payload: SharePacket }
export async function publishDocumentShare(id: string, tokenHash: string, expiresAt: string, payload: SharePacket) {
  const cloud = await getCloud(); if (!cloud) throw new Error('shareNoConfig'); await currentUser();
  const { data, error } = await cloud.rpc('create_document_share', { p_id: id, p_token_hash: tokenHash, p_expires_at: expiresAt, p_payload: payload });
  if (error || data !== id) throw new Error('shareError');
}
export async function revokeDocumentShare(id: string) {
  const cloud = await getCloud(); if (!cloud) throw new Error('shareNoConfig'); await currentUser();
  const { error } = await cloud.rpc('revoke_document_share', { p_id: id }); if (error) throw new Error('shareError');
}
/** Guest access never uses or persists the practitioner's authenticated Supabase client. */
export async function fetchSharedDocument(id: string, token: string): Promise<RemoteShare> {
  const env: Partial<Record<string, string>> = import.meta.env ?? {};
  if (!loadGuestSdk || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new Error('shareUnavailable');
  const { createClient } = await loadGuestSdk();
  const guest = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', referrerPolicy: 'no-referrer' }) } });
  const { data, error } = await guest.rpc('read_document_share', { p_id: id, p_token: token });
  if (error || !data || data.id !== id || typeof data.expires_at !== 'string' || Date.parse(data.expires_at) <= Date.now() || data.payload?.version !== 1 || typeof data.payload.ciphertext !== 'string' || data.payload.ciphertext.length > SHARE_MAX_CIPHER_CHARS) throw new Error('shareUnavailable');
  return data;
}
const queueKey = (vaultId: string) => `share-revocations:${vaultId}`;
export async function queueShareRevocations(vaultId: string, ids: string[]) { if (ids.length) await updateMetaSet(queueKey(vaultId), ids); }
export async function flushShareRevocations(vaultId: string) {
  const ids = await metaGet<string[]>(queueKey(vaultId)) ?? [];
  for (const id of ids) {
    await revokeDocumentShare(id);
    // Re-read so additions during a network request are preserved.
    await updateMetaSet(queueKey(vaultId), [], [id]);
  }
}
