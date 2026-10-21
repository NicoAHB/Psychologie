import { normalizeVault, type Ciphertext, type KeyWrap, type VaultData, type VaultEnvelope, type Wraps } from './types';
const encoder = new TextEncoder();
export const ITERATIONS = 600000 as const;
export function toBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const randomSalt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)));
export async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromBase64(salt), iterations: ITERATIONS, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptBytes(key: CryptoKey, value: Uint8Array<ArrayBuffer>, context: string): Promise<Ciphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, key, value);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
}
export async function decryptBytes(key: CryptoKey, payload: Ciphertext, context: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv), additionalData: encoder.encode(context) }, key, fromBase64(payload.ciphertext)));
}
/** Encrypt the vault data; `base` supplies identity, salt and (for v2) the key wraps, which stay untouched. */
export async function encryptVault(key: CryptoKey, data: VaultData, vaultId: string, salt: string, base: Partial<VaultEnvelope> = {}): Promise<VaultEnvelope> {
  return { format: 'praxisraum-v1', ...base, vaultId, salt, iterations: ITERATIONS,
    payload: await encryptBytes(key, encoder.encode(JSON.stringify(data)), `praxisraum:v1:${vaultId}`) };
}
// ---- Format v2: a random data key is wrapped once per unlock method (passphrase, recovery key, passkeys). ----
export const randomKeyBytes = () => crypto.getRandomValues(new Uint8Array(32));
export const importDataKey = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
/** Raw PBKDF2 output; for format v1 this *is* the data key (deriveKey yields the same bits). */
export async function deriveBits(passphrase: string, salt: string): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromBase64(salt), iterations: ITERATIONS, hash: 'SHA-256' }, material, 256));
}
/** Key-encryption key from a high-entropy secret (recovery key bytes, passkey PRF output). */
export async function secretKek(secret: Uint8Array<ArrayBuffer>, purpose: 'recovery' | 'passkey'): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode(`praxisraum:kek:v2:${purpose}`) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const wrapContext = (vaultId: string, kind: string) => `praxisraum:wrap:v2:${vaultId}:${kind}`;
export async function wrapDataKey(kek: CryptoKey, raw: Uint8Array<ArrayBuffer>, vaultId: string, kind: string): Promise<KeyWrap> {
  return { ...await encryptBytes(kek, raw, wrapContext(vaultId, kind)), at: Date.now() };
}
export const unwrapDataKey = (kek: CryptoKey, wrap: KeyWrap, vaultId: string, kind: string) => decryptBytes(kek, wrap, wrapContext(vaultId, kind));
/** Which of the envelope's passphrase salts applies: v2 keeps it inside the wrap so cloud copies cannot go stale. */
export const passphraseSalt = (envelope: VaultEnvelope) => (envelope.wraps?.passphrase as KeyWrap & { salt?: string } | undefined)?.salt ?? envelope.salt;
export type PassphraseWrap = KeyWrap & { salt: string };
export async function wrapWithPassphrase(passphrase: string, raw: Uint8Array<ArrayBuffer>, vaultId: string): Promise<{ salt: string; wrap: PassphraseWrap }> {
  const salt = randomSalt(); const kek = await deriveKey(passphrase, salt);
  return { salt, wrap: { ...await wrapDataKey(kek, raw, vaultId, 'passphrase'), salt } };
}
export type { Wraps };
export function validateEnvelope(value: unknown): asserts value is VaultEnvelope {
  const v = value as VaultEnvelope;
  if (!v || (v.format !== 'praxisraum-v1' && v.format !== 'praxisraum-v2') || (v.format === 'praxisraum-v2' && !v.wraps?.passphrase) || v.iterations !== ITERATIONS ||
    !/^[0-9a-f-]{36}$/i.test(v.vaultId) || fromBase64(v.salt).length !== 16 ||
    fromBase64(v.payload?.iv ?? '').length !== 12 || fromBase64(v.payload?.ciphertext ?? '').length < 16) throw new Error('invalidBackup');
}
export async function decryptVault(key: CryptoKey, envelope: VaultEnvelope): Promise<VaultData> {
  validateEnvelope(envelope);
  const value = JSON.parse(new TextDecoder().decode(await decryptBytes(key, envelope.payload, `praxisraum:v1:${envelope.vaultId}`)));
  if (value.schema !== 1 || !Array.isArray(value.clients) || !Array.isArray(value.appointments) ||
    !Array.isArray(value.sessions) || !Array.isArray(value.notes) || !value.settings) throw new Error('invalidBackup');
  return normalizeVault(value);
}
export async function encryptReminder(publicPem: string, value: unknown, id: string) {
  const pem = publicPem.replaceAll('\\n', '\n').replace(/-----[^-]+-----|\s/g, '');
  const publicKey = await crypto.subtle.importKey('spki', fromBase64(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const wrappedKey = await crypto.subtle.wrapKey('raw', contentKey, publicKey, { name: 'RSA-OAEP' });
  const encrypted = await encryptBytes(contentKey, encoder.encode(JSON.stringify(value)), `praxisraum-reminder:v1:${id}`);
  return { version: 1, wrappedKey: toBase64(new Uint8Array(wrappedKey)), ...encrypted };
}
