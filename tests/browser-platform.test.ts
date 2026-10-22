import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBackupTarget, BACKUP_COPIES, type BackupDirectory } from '../src/lib/directoryBackup';
import { createLocalRecognition, localSpeechAvailability, localSpeechConstructor, type LocalSpeechConstructor } from '../src/lib/localSpeech';
import { encryptVideoSignal, parseVideoInvitation, VideoSignalReader, videoKey, videoLink, type VideoRoom, type VideoSignal } from '../src/lib/videoRoom';
import { uid } from '../src/lib/types';

function directory() {
  const files = new Map<string, string>(); const removed: string[] = []; let fail = false; let aborted = false;
  const handle: BackupDirectory = { name: 'Backups', kind: 'directory',
    getFileHandle: async name => ({ name, createWritable: async () => { files.set(name, ''); let text = ''; return { write: async value => { text = value; if (fail) throw new Error('disk full'); }, close: async () => { files.set(name, text); }, abort: async () => { aborted = true; } }; } }),
    async *entries() { for (const name of files.keys()) yield [name, { kind: 'file' }]; },
    removeEntry: async name => { removed.push(name); files.delete(name); },
  };
  return { handle, files, removed, setFail: () => { fail = true; }, wasAborted: () => aborted };
}
test('rolling directory backups retain the latest 30 committed files and never prune unrelated files', async () => {
  const d = directory(), vault = uid(); d.files.set('family-photo.jpg', 'keep'); d.files.set(`praxisraum-${uid()}-unrelated.encrypted.json`, 'keep');
  for (let i = 0; i < BACKUP_COPIES + 5; i++) await writeBackupTarget(d.handle, vault, `ciphertext-${i}`, new Date(1000000 + i * 1000));
  assert.equal(d.files.size, BACKUP_COPIES + 2); assert.equal(d.removed.length, 5); assert.ok([...d.files.values()].includes(`ciphertext-${BACKUP_COPIES + 4}`));
  assert.equal(d.files.get('family-photo.jpg'), 'keep');
  await writeBackupTarget(d.handle, vault, 'NEW AFTER CLOCK ROLLBACK', new Date(-1000000));
  assert.equal(d.files.size, BACKUP_COPIES + 2); assert.ok([...d.files.values()].includes('NEW AFTER CLOCK ROLLBACK'));
});
test('a failed backup aborts and removes only its new incomplete file, preserving the last good copy', async () => {
  const d = directory(), vault = uid(); await writeBackupTarget(d.handle, vault, 'GOOD CIPHERTEXT'); const before = [...d.files.entries()]; d.setFail();
  await assert.rejects(() => writeBackupTarget(d.handle, vault, 'BAD'), /disk full/); assert.equal(d.wasAborted(), true); assert.deepEqual([...d.files.entries()], before);
});
test('speech refuses remote-only browsers and requires explicit local language availability', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window'); let started = 0; let requested: unknown;
  class Local {
    processLocally = false; lang = ''; continuous = false; interimResults = false; onresult = null; onerror = null; onend = null;
    start() { assert.equal(this.processLocally, true); started++; } stop() {} abort() {}
    static async available(options: unknown) { requested = options; return 'available' as const; }
  }
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, SpeechRecognition: class Remote { start() { throw new Error('must never start'); } } } });
    assert.equal(localSpeechConstructor(), undefined);
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Local;
    const ctor = localSpeechConstructor()!; assert.equal(await localSpeechAvailability(ctor, 'uk-UA'), 'available'); assert.deepEqual(requested, { langs: ['uk-UA'], processLocally: true });
    const r = createLocalRecognition(ctor, 'uk-UA'); r.start(); assert.equal(started, 1); assert.equal(r.lang, 'uk-UA'); assert.equal(r.interimResults, true);
    const unavailable = Local as unknown as LocalSpeechConstructor; unavailable.available = async () => { throw new Error('blocked'); }; assert.equal(await localSpeechAvailability(unavailable, 'de-DE'), 'unavailable');
  } finally { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window'); }
});
test('video invitation keeps its 256-bit capability in the URL fragment and rejects malformed links', () => {
  const room = { id: uid(), secret: 'A'.repeat(43), language: 'uk' as const };
  const url = new URL(videoLink(room, 'https://praxis.example/Psychologie/?old=1')); assert.equal(url.pathname, '/Psychologie/'); assert.equal(url.search, '');
  assert.equal(new URL(url.origin + url.pathname).href.includes(room.secret), false); assert.deepEqual(parseVideoInvitation(url.hash), room);
  assert.equal(parseVideoInvitation(url.hash.replace('v1.', 'v2.')), null); assert.equal(parseVideoInvitation('#video=bad'), null);
});
test('signaling ciphertext authenticates the room, expires, rejects tampering, wrong keys and replay', async () => {
  const room: VideoRoom = { id: uid(), secret: 'A'.repeat(43), language: 'de', expiresAt: Date.now() + 60000 };
  const key = await videoKey(room.secret); const signal: VideoSignal = { version: 1, room: room.id, expiresAt: room.expiresAt, id: uid(), from: uid(), role: 'host', to: uid(), kind: 'offer', description: { type: 'offer', sdp: 'PRIVATE SDP ICE IP 192.168.1.20' } };
  const encrypted = await encryptVideoSignal(key, signal); assert.doesNotMatch(JSON.stringify(encrypted), /PRIVATE|192\.168|offer/);
  const reader = new VideoSignalReader(room, key); assert.deepEqual(await reader.read(encrypted), signal); assert.equal(await reader.read(encrypted), null);
  assert.equal(await new VideoSignalReader(room, key).read(encrypted, room.expiresAt), null);
  assert.equal(await new VideoSignalReader({ ...room, id: uid() }, key).read(encrypted), null);
  assert.equal(await new VideoSignalReader(room, await videoKey('B'.repeat(43))).read(encrypted), null);
  assert.equal(await new VideoSignalReader(room, key).read({ ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -8) + 'AAAAAAAA' }), null);
  assert.equal(await new VideoSignalReader(room, key).read(await encryptVideoSignal(key, { ...signal, expiresAt: room.expiresAt + 1 })), null);
});
