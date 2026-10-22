import manifest from '../../public/speech/whisper-tiny-v1/manifest.json';

export const speechPack = manifest;
export const SPEECH_PACK_BYTES = manifest.files.reduce((n, file) => n + file.bytes, 0);
export function speechAsset(name: string): string {
  return new URL(`${import.meta.env.BASE_URL}speech/${manifest.version}/${name}`, self.location.origin).href;
}
function cacheName() { return `praxisraum-speech:${import.meta.env.BASE_URL}:${manifest.version}`; }
export async function hasSpeechPack(): Promise<boolean> {
  return await speechPackStoredBytes() === SPEECH_PACK_BYTES;
}
export async function speechPackStoredBytes(): Promise<number> {
  if (!('caches' in self)) return 0;
  const cache = await caches.open(cacheName());
  let bytes = 0;
  for (const file of manifest.files) {
    const cached = await cache.match(speechAsset(file.name));
    if (cached?.headers.get('x-praxisraum-sha256') === file.sha256) bytes += file.bytes;
  }
  return bytes;
}
export async function removeSpeechPack() { await caches.delete(cacheName()); }
async function verify(bytes: ArrayBuffer, file: typeof manifest.files[number]) {
  if (bytes.byteLength !== file.bytes) throw new Error('speechOfflineError');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (digest !== file.sha256) throw new Error('speechOfflineError');
}
/** Public model assets only. Audio and transcripts never enter this cache. */
export async function installSpeechPack(progress: (percent: number) => void, signal?: AbortSignal) {
  const cache = await caches.open(cacheName()); let done = 0;
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (estimate?.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < SPEECH_PACK_BYTES - await speechPackStoredBytes() + 16 * 1024 * 1024) throw new Error('speechOfflineSpace');
  for (const file of manifest.files) {
    signal?.throwIfAborted(); const url = speechAsset(file.name), cached = await cache.match(url);
    if (cached?.headers.get('x-praxisraum-sha256') === file.sha256) {
      try { await verify(await cached.arrayBuffer(), file); done += file.bytes; progress(Math.floor(done * 100 / SPEECH_PACK_BYTES)); continue; }
      catch { await cache.delete(url); }
    }
    const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error('speechOfflineError');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        chunks.push(next.value); length += next.value.length;
        if (length > file.bytes) throw new Error('speechOfflineError');
        progress(Math.min(99, Math.floor((done + length) * 100 / SPEECH_PACK_BYTES)));
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    await verify(bytes.buffer, file); signal?.throwIfAborted();
    await cache.put(url, new Response(bytes, { headers: { 'content-type': file.kind === 'mjs' ? 'text/javascript' : file.kind === 'wasm' ? 'application/wasm' : 'application/octet-stream', 'x-praxisraum-sha256': file.sha256 } }));
    done += file.bytes;
  }
  progress(100);
}
export async function readSpeechAsset(kind: string): Promise<Uint8Array<ArrayBuffer>> {
  const cache = await caches.open(cacheName()), files = manifest.files.filter(f => f.kind === kind);
  const bytes = new Uint8Array(files.reduce((n, file) => n + file.bytes, 0)); let offset = 0;
  for (const file of files) {
    const response = await cache.match(speechAsset(file.name)); if (!response) throw new Error('speechOfflineMissing');
    const part = await response.arrayBuffer();
    try { await verify(part, file); } catch { await cache.delete(speechAsset(file.name)); throw new Error('speechOfflineMissing'); }
    bytes.set(new Uint8Array(part), offset); offset += part.byteLength;
  }
  return bytes;
}
