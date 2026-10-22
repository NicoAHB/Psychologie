import { decryptBytes, encryptBytes, fromBase64, importDataKey, randomKeyBytes, toBase64 } from './crypto';
import { cloudConfigured, getCloud } from './cloud';
import type { Language, Ciphertext } from './types';

export interface VideoInvitation { id: string; secret: string; language: Language }
export interface VideoRoom extends VideoInvitation { expiresAt: number }
export type VideoRole = 'host' | 'guest';
export interface VideoSignal {
  version: 1; room: string; expiresAt: number; id: string; from: string; role: VideoRole; to?: string;
  kind: 'knock' | 'approve' | 'offer' | 'answer' | 'ice' | 'bye';
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const urlSecret = () => toBase64(randomKeyBytes()).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export function parseVideoInvitation(hash: string): VideoInvitation | null {
  const match = /^#video=v1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})\.(de|uk)$/i.exec(hash);
  if (!match || !uuid.test(match[1]) || !secretPattern.test(match[2])) return null;
  return { id: match[1], secret: match[2], language: match[3].toLowerCase() as Language };
}
export function videoLink(room: VideoInvitation, base: string): string {
  const url = new URL(base); url.search = ''; url.hash = `video=v1.${room.id}.${room.secret}.${room.language}`; return url.href;
}
export async function videoKey(secret: string) {
  if (!secretPattern.test(secret)) throw new Error('videoInvalid');
  return importDataKey(fromBase64(secret.replaceAll('-', '+').replaceAll('_', '/') + '='));
}
/** Display the same verification code on both peers; compare through a known, separate contact channel. */
export async function videoCode(room: VideoInvitation): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${room.id}:${room.secret}`)));
  return Array.from(digest.slice(0, 4), b => b.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{4}/g)!.join(' ');
}
export const encryptVideoSignal = (key: CryptoKey, signal: VideoSignal) => encryptBytes(key, new TextEncoder().encode(JSON.stringify(signal)), `praxisraum-video:v1:${signal.room}`);
export class VideoSignalReader {
  private seen = new Set<string>();
  constructor(private room: VideoRoom, private key: CryptoKey) {}
  async read(payload: unknown, now = Date.now()): Promise<VideoSignal | null> {
    if (now >= this.room.expiresAt) return null;
    const p = payload as Ciphertext;
    if (!p || typeof p.iv !== 'string' || p.iv.length !== 16 || typeof p.ciphertext !== 'string' || p.ciphertext.length > 100000) return null;
    try {
      const signal = JSON.parse(new TextDecoder().decode(await decryptBytes(this.key, p, `praxisraum-video:v1:${this.room.id}`))) as VideoSignal;
      if (signal.version !== 1 || signal.room !== this.room.id || signal.expiresAt !== this.room.expiresAt || !uuid.test(signal.id) || !uuid.test(signal.from) || !['host', 'guest'].includes(signal.role) || !['knock', 'approve', 'offer', 'answer', 'ice', 'bye'].includes(signal.kind) || this.seen.has(signal.id) || signal.to && !uuid.test(signal.to)) return null;
      if (signal.kind === 'knock' ? signal.role !== 'guest' || !!signal.to : !signal.to) return null;
      if (['approve', 'offer'].includes(signal.kind) && signal.role !== 'host' || signal.kind === 'answer' && signal.role !== 'guest') return null;
      if ((signal.kind === 'offer' || signal.kind === 'answer') && (signal.description?.type !== signal.kind || typeof signal.description.sdp !== 'string' || signal.description.sdp.length > 65000)) return null;
      if (signal.kind === 'ice' && (!signal.candidate || typeof signal.candidate.candidate !== 'string' || signal.candidate.candidate.length > 4096)) return null;
      if (this.seen.size >= 4096) return null;
      this.seen.add(signal.id); return signal;
    } catch { return null; }
  }
}
export async function createVideoRoom(language: Language): Promise<VideoRoom> {
  const cloud = await getCloud(); if (!cloud) throw new Error('cloudMissing');
  const { data, error } = await cloud.rpc('create_video_room');
  if (error || !data?.id || !Number.isFinite(Date.parse(data.expires_at))) throw new Error('videoSetup');
  return { id: data.id, secret: urlSecret(), language, expiresAt: Date.parse(data.expires_at) };
}
export async function closeVideoRoom(id: string) {
  const cloud = await getCloud(); if (!cloud) return;
  const { error } = await cloud.rpc('close_video_room', { p_id: id }); if (error) throw new Error('videoError');
}
/** A guest never reads/writes the therapist's auth storage or signs into their account. */
export async function guestVideoCloud() {
  if (!cloudConfigured) throw new Error('cloudMissing');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'praxisraum-video-guest' } });
}
/** No third-party STUN server is built in. Optional explicitly configured STUN is opt-in in the call UI.
 * TURN URLs are rejected, so there is no relay traffic or automatic paid fallback. */
export function configuredStun(): RTCIceServer[] {
  const urls = (import.meta.env?.VITE_WEBRTC_STUN_URLS ?? '').split(',').map((s: string) => s.trim()).filter((s: string) => /^stuns?:[a-z0-9.-]+(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/i.test(s));
  return urls.length ? [{ urls }] : [];
}
