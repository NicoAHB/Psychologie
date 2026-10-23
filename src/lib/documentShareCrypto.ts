import { decryptBytes, deriveKey, encryptBytes, fromBase64, randomSalt, toBase64 } from './crypto';
import type { Ciphertext, Language } from './types';
export const SHARE_MAX_BYTES = 10 * 1024 * 1024;
export const SHARE_MAX_CIPHER_CHARS = Math.ceil((SHARE_MAX_BYTES + 4096) / 3) * 4 + 24;
export interface SharePacket extends Ciphertext { version: 1; salt: string; protected: boolean }
export interface ShareInvitation { id: string; secret: string; token: string; language: Language }
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, secretPattern = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();
export const randomShareSecret = () => toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export async function shareTokenHash(token: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export function shareFragment(invitation: ShareInvitation) { if (!validInvitation(invitation)) throw new Error('shareUnavailable'); return `#document=${invitation.id}.${invitation.secret}.${invitation.token}.${invitation.language}`; }
function validInvitation(value: ShareInvitation) { return idPattern.test(value.id) && secretPattern.test(value.secret) && secretPattern.test(value.token) && ['de', 'uk'].includes(value.language); }
export function parseShareInvitation(hash: string): ShareInvitation | null {
  if (!hash.startsWith('#document=') || hash.length > 180) return null;
  const parts = hash.slice(10).split('.'); if (parts.length !== 4) return null;
  const result = { id: parts[0], secret: parts[1], token: parts[2], language: parts[3] as Language };
  return validInvitation(result) ? result : null;
}
const context = (id: string, expiresAt: string) => `praxisraum-document-share:v1:${id}:${expiresAt}`;
const validName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\x00-\x1f/\\]/.test(value);
const validMime = (value: unknown): value is string => typeof value === 'string' && ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text'].includes(value);
export async function sealSharedDocument(input: { id: string; expiresAt: string; secret: string; passphrase: string; fileName: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }): Promise<SharePacket> {
  if (!idPattern.test(input.id) || !secretPattern.test(input.secret) || !validName(input.fileName) || !validMime(input.mimeType) || !input.bytes.length || input.bytes.length > SHARE_MAX_BYTES || input.passphrase && input.passphrase.length < 12) throw new Error('shareError');
  const header = encoder.encode(JSON.stringify({ fileName: input.fileName, mimeType: input.mimeType })), packed = new Uint8Array(4 + header.length + input.bytes.length);
  new DataView(packed.buffer).setUint32(0, header.length); packed.set(header, 4); packed.set(input.bytes, 4 + header.length);
  const salt = randomSalt();
  try { return { version: 1, salt, protected: !!input.passphrase, ...await encryptBytes(await deriveKey(JSON.stringify([input.secret, input.passphrase]), salt), packed, context(input.id, input.expiresAt)) }; }
  finally { packed.fill(0); }
}
export async function openSharedDocument(input: { id: string; expiresAt: string; secret: string; passphrase: string; packet: SharePacket }): Promise<{ fileName: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }> {
  const p = input.packet;
  if (!idPattern.test(input.id) || !secretPattern.test(input.secret) || p?.version !== 1 || typeof p.ciphertext !== 'string' || p.ciphertext.length > SHARE_MAX_CIPHER_CHARS || fromBase64(p.salt).length !== 16 || fromBase64(p.iv).length !== 12) throw new Error('shareDecryptError');
  const packed = await decryptBytes(await deriveKey(JSON.stringify([input.secret, input.passphrase]), p.salt), p, context(input.id, input.expiresAt));
  try { if (packed.length < 5) throw new Error(); const n = new DataView(packed.buffer, packed.byteOffset).getUint32(0); if (n > 2048 || 4 + n >= packed.length) throw new Error();
    const metadata = JSON.parse(new TextDecoder().decode(packed.subarray(4, 4 + n))); if (!validName(metadata.fileName) || !validMime(metadata.mimeType) || packed.length - 4 - n > SHARE_MAX_BYTES) throw new Error();
    return { ...metadata, bytes: packed.slice(4 + n) };
  } finally { packed.fill(0); }
}
