import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { unzipSync, strFromU8 } from 'fflate';
import { audioExtension, audioMime, MEMO_MAX_BYTES, MEMO_MAX_DURATION_MS, memoTime, validateMemo } from '../src/lib/audioMemos';
import { MemoRecorder, memoMimeType, type MemoRecorderEvents } from '../src/lib/memoRecorder';
import { registerMemoMedia, stopMemoMedia } from '../src/lib/autoLock';
import { emptyVault, normalizeVault, uid, type AudioMemo, type VaultData } from '../src/lib/types';
import { referencedBlobs } from '../src/lib/blobs';
import { deleteAudioMemo, deleteClient, deleteSession, orphanedBlobs } from '../src/lib/records';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { erasedAudioMemoIds, redactAudioMemos, resolveConflict, stateOf, syncConflicts } from '../src/lib/crdt';
import { decryptBytes, decryptVault, encryptBytes, encryptVault, randomSalt } from '../src/lib/crypto';
import { finishBlobCleanup, getRemovals, pendingBlobCleanup, purgeBlobs, queueBlobCleanup, readBlob, writeBlob } from '../src/lib/db';
import { historyBlobIds, listSnapshots, readSnapshot, recordSnapshot, rewriteSnapshots } from '../src/lib/history';
import { clientExport } from '../src/lib/clientExport';
import { searchVault } from '../src/lib/search';

function memo(id = 'memo', sessionId = 'session', clientId = 'client'): AudioMemo {
  return { id, sessionId, clientId, blobId: `file-${id}`, mimeType: 'audio/mp4', size: 4, durationMs: 1000, createdAt: '2026-10-22T14:30:00Z', label: 'Ressourcen', summary: 'Von Hand: Спокій та надія' };
}
function fixture() {
  const data = emptyVault();
  data.clients.push({ id: 'client', name: 'PRIVATE CLIENT', language: 'de', contact: '', preparation: '', createdAt: '2026-01-01', telegramChatId: '', reminderConsent: false });
  data.sessions.push({ id: 'session', clientId: 'client', date: '2026-10-22', time: '14:00', notes: 'Original note', tags: [], feeCents: 8500, paidAt: null });
  data.audioMemos.push(memo()); data.crdt = stateOf(data); return data;
}
function edit(before: VaultData, actor: string, work: (d: VaultData) => void) {
  const after = structuredClone(before); work(after); stampChanges(before, after, 10, actor); return after;
}
const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

test('old vaults and encrypted backups without memos gain an empty collection without changing existing records', async () => {
  const legacy = fixture(); delete (legacy as Partial<VaultData>).audioMemos; delete legacy.crdt;
  const snapshot = JSON.stringify(legacy), expected = { ...structuredClone(legacy), audioMemos: [] };
  assert.deepEqual(normalizeVault(legacy), expected); assert.equal(JSON.stringify(legacy), snapshot);
  const envelope = await encryptVault(key, legacy, uid(), randomSalt());
  assert.deepEqual(await decryptVault(key, envelope), expected);
  const result = mergeVaults(legacy, expected); assert.deepEqual(result.audioMemos, []); assert.equal(result.sessions[0].notes, 'Original note');
});
test('memo format, byte/duration and manual text limits accept the boundaries and reject malformed input', () => {
  validateMemo({ size: MEMO_MAX_BYTES, durationMs: MEMO_MAX_DURATION_MS, mimeType: 'audio/webm;codecs=opus' }, { label: 'a'.repeat(120), summary: 'я'.repeat(2000) });
  for (const patch of [{ size: 0 }, { size: -1 }, { size: 1.5 }, { durationMs: 0 }, { durationMs: NaN }, { durationMs: Infinity }]) assert.throws(() => validateMemo({ ...memo(), ...patch }), /memoInvalidRecording/);
  assert.throws(() => validateMemo({ ...memo(), size: MEMO_MAX_BYTES + 1 }), /memoSizeLimit/);
  assert.throws(() => validateMemo({ ...memo(), durationMs: MEMO_MAX_DURATION_MS + 1 }), /memoDurationLimit/);
  assert.throws(() => validateMemo({ ...memo(), mimeType: 'text/html' }), /memoUnsupported/);
  assert.throws(() => validateMemo(memo(), { label: '', summary: 'x'.repeat(2001) }), /memoTextLimit/);
  assert.throws(() => validateMemo(memo(), { label: 'x'.repeat(121), summary: '' }), /memoTextLimit/);
  assert.equal(audioMime('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4'); assert.equal(audioExtension('audio/mp4'), 'm4a');
  assert.equal(audioExtension('audio/webm'), 'webm'); assert.equal(memoTime(20 * 60000), '20:00');
});
test('concurrent new memos and independent metadata edits merge without mixing recording tuples', () => {
  const base = fixture();
  const a = edit(base, 'A', d => { d.audioMemos[0].label = 'Vom Laptop'; d.audioMemos.push(memo('laptop')); });
  const b = edit(base, 'B', d => { d.audioMemos[0].summary = 'Ручний текст'; d.audioMemos.push(memo('phone')); });
  const result = mergeVaults(a, b);
  assert.equal(result.audioMemos.length, 3); assert.equal(result.audioMemos[0].label, 'Vom Laptop'); assert.equal(result.audioMemos[0].summary, 'Ручний текст'); assert.equal(syncConflicts(result).length, 0);
  assert.deepEqual(mergeVaults(a, b), mergeVaults(b, a)); assert.deepEqual(mergeVaults(result, result), result);
  const x = edit(base, 'X', d => { Object.assign(d.audioMemos[0], { blobId: 'file-X', size: 55, mimeType: 'audio/webm', durationMs: 3000 }); });
  const y = edit(base, 'Y', d => { Object.assign(d.audioMemos[0], { blobId: 'file-Y', size: 66, mimeType: 'audio/mp4', durationMs: 4000 }); });
  const joined = mergeVaults(x, y), conflict = syncConflicts(joined).find(c => c.field === '$recording')!;
  assert.equal(conflict.variants.length, 2); assert.deepEqual(referencedBlobs(joined).sort(), ['file-X', 'file-Y']);
  assert.ok(conflict.variants.some(v => JSON.stringify(v.value) === JSON.stringify({ blobId: joined.audioMemos[0].blobId, mimeType: joined.audioMemos[0].mimeType, size: joined.audioMemos[0].size, durationMs: joined.audioMemos[0].durationMs })));
  const summaries = mergeVaults(edit(base, 'X', d => { d.audioMemos[0].summary = 'Alternative X'; }), edit(base, 'Y', d => { d.audioMemos[0].summary = 'Alternative Y'; }));
  assert.deepEqual(syncConflicts(summaries).find(c => c.field === 'summary')!.variants.map(v => v.value).sort(), ['Alternative X', 'Alternative Y']);
  const summaryConflict = syncConflicts(summaries).find(c => c.field === 'summary')!;
  assert.throws(() => resolveConflict(summaries, summaryConflict, summaryConflict.variants[0], 'x'.repeat(2001)), /memoTextLimit/);
});
test('memo, session and client deletion erase audio and hidden metadata, including concurrent offline additions', () => {
  const base = fixture(), concurrent = edit(base, 'offline', d => { d.audioMemos[0].summary = 'CONCURRENT SECRET'; d.audioMemos.push(memo('offline-new')); });
  for (const remove of [deleteAudioMemo, deleteSession, deleteClient]) {
    const id = remove === deleteAudioMemo ? 'memo' : remove === deleteSession ? 'session' : 'client';
    const gone = edit(base, 'deleting', d => remove(d, id)), joined = mergeVaults(gone, concurrent);
    const expectedRemaining = remove === deleteAudioMemo ? 1 : 0;
    assert.equal(joined.audioMemos.length, expectedRemaining);
    assert.doesNotMatch(JSON.stringify(joined.crdt), /CONCURRENT SECRET|file-memo|Спокій та надія(?=.*file-memo)/);
    assert.equal(mergeVaults(joined, concurrent).audioMemos.length, expectedRemaining);
    assert.ok(erasedAudioMemoIds(joined).has('memo'));
    const restore = edit(joined, 'restore-old-snapshot', d => { d.audioMemos.push(memo()); });
    assert.ok(!restore.audioMemos.some(m => m.id === 'memo'));
    assert.ok(orphanedBlobs(referencedBlobs(base), gone).includes('file-memo'));
  }
});
test('audio blobs round-trip through encrypted backup JSON with authenticated file context', async () => {
  const data = fixture(), vaultId = uid(), bytes = new Uint8Array([1, 2, 3, 4]);
  const encrypted = { id: 'file-memo', vaultId, payload: await encryptBytes(key, bytes, `praxisraum-blob:v1:${vaultId}:file-memo`) };
  const backup = { type: 'praxisraum-backup-v1', envelope: await encryptVault(key, data, vaultId, randomSalt()), blobs: [encrypted] };
  const serialized = JSON.stringify(backup); assert.doesNotMatch(serialized, /PRIVATE CLIENT|Спокій|audio\/mp4|Ressourcen/);
  const restored = JSON.parse(serialized); await writeBlob(restored.blobs[0]);
  const vault = await decryptVault(key, restored.envelope); assert.deepEqual(vault.audioMemos, data.audioMemos); assert.deepEqual(referencedBlobs(vault), ['file-memo']);
  assert.deepEqual(await decryptBytes(key, (await readBlob('file-memo'))!.payload, `praxisraum-blob:v1:${vaultId}:file-memo`), bytes);
  await assert.rejects(() => decryptBytes(key, encrypted.payload, `praxisraum-blob:v1:${vaultId}:other-file`));
  await purgeBlobs(vaultId, [encrypted.id]); assert.equal(await readBlob(encrypted.id), undefined); assert.ok((await getRemovals(vaultId)).has(encrypted.id));
});
test('snapshot redaction keeps unrelated photos, re-encrypts history and cannot be partially committed', async () => {
  const vaultId = uid(), salt = randomSalt(), data = fixture();
  data.notes.push({ id: 'note', clientId: 'client', blobId: 'photo', createdAt: '2026-10-22', tags: [], caption: 'Keep photo' });
  const envelope = await encryptVault(key, data, vaultId, salt);
  await recordSnapshot(envelope, true, 100, referencedBlobs(data)); await recordSnapshot(envelope, true, 200, referencedBlobs(data));
  let count = 0;
  await assert.rejects(() => rewriteSnapshots(vaultId, async entry => { if (++count === 2) throw new Error('interrupted'); return { envelope: entry, blobIds: [] }; }), /interrupted/);
  assert.deepEqual([...await historyBlobIds(vaultId)].sort(), ['file-memo', 'photo']);
  await rewriteSnapshots(vaultId, async entry => {
    const old = await decryptVault(key, entry); redactAudioMemos(old, new Set(['memo']));
    return { envelope: await encryptVault(key, old, vaultId, salt), blobIds: referencedBlobs(old) };
  });
  assert.deepEqual([...await historyBlobIds(vaultId)], ['photo']);
  for (const entry of await listSnapshots(vaultId)) {
    const stored = (await readSnapshot(vaultId, entry.at))!, restored = await decryptVault(key, stored);
    assert.equal(restored.audioMemos.length, 0); assert.doesNotMatch(JSON.stringify(restored.crdt), /file-memo|Ressourcen|Спокій/);
    assert.equal(restored.notes[0].caption, 'Keep photo'); assert.doesNotMatch(JSON.stringify(stored), /Keep photo/);
  }
});
test('cleanup journal survives an interrupted delete and concurrent file additions without dropping candidates', async () => {
  const vault = uid(); await Promise.all([queueBlobCleanup(vault, ['old-file']), queueBlobCleanup(vault, ['other-file'])]);
  assert.deepEqual((await pendingBlobCleanup(vault)).sort(), ['old-file', 'other-file']);
  await Promise.all([finishBlobCleanup(vault, ['old-file']), queueBlobCleanup(vault, ['fresh-file'])]);
  assert.deepEqual((await pendingBlobCleanup(vault)).sort(), ['fresh-file', 'other-file']);
  assert.deepEqual(await pendingBlobCleanup(uid()), []);
});
test('client ZIP includes original memo bytes and manual summaries; search finds label and Ukrainian summary', async () => {
  const data = fixture(); data.audioMemos.push(memo('other', 'other-session', 'other-client'));
  assert.equal(searchVault(data, 'спокій')[0].kind, 'audioMemo'); assert.ok(searchVault(data, 'ressourcen').some(hit => hit.id === 'memo'));
  const loaded: string[] = [];
  const archive = await clientExport(data, 'client', 'uk', async id => { loaded.push(id); return new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mp4' }); });
  const files = unzipSync(archive.bytes);
  assert.deepEqual(loaded, ['file-memo']); assert.deepEqual(files['sprach-memos/memo.m4a'], new Uint8Array([1, 2, 3, 4]));
  assert.match(strFromU8(files['sprach-memos.md']), /Спокій та надія/); assert.equal(JSON.parse(strFromU8(files['daten.json'])).audioMemos[0].path, 'sprach-memos/memo.m4a');
});

function platform(supported: string[] = ['audio/webm;codecs=opus']) {
  let clock = 0, permissionCalls = 0, stopped = 0, instance: FakeRecorder;
  const track = { stop: () => { stopped++; } }, stream = { getTracks: () => [track] } as unknown as MediaStream;
  class FakeRecorder {
    static isTypeSupported = (type: string) => supported.includes(type);
    state = 'inactive'; mimeType: string; ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(_stream: MediaStream, options: MediaRecorderOptions) { this.mimeType = options.mimeType ?? ''; instance = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) }); this.onstop?.(); }); }
    emit(bytes: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) }); }
  }
  const events: { name: string; value?: unknown }[] = [];
  const handlers: MemoRecorderEvents = { status: value => events.push({ name: 'status', value }), tick: value => events.push({ name: 'tick', value }), recorded: value => events.push({ name: 'recorded', value }), error: value => events.push({ name: 'error', value }), limit: value => events.push({ name: 'limit', value }) };
  const device = { getUserMedia: async () => { permissionCalls++; return stream; } };
  const api = { devices: device, Recorder: FakeRecorder as unknown as typeof MediaRecorder, now: () => clock };
  return { api, device, handlers, events, stream, setClock: (n: number) => { clock = n; }, recorder: () => instance!, permissions: () => permissionCalls, stops: () => stopped };
}
test('recorder requests permission only on start, supports Safari MP4 and Chrome WebM and releases the microphone', async () => {
  for (const mimeType of ['audio/mp4', 'audio/webm;codecs=opus']) {
    const p = platform([mimeType]), recorder = new MemoRecorder(p.handlers, p.api);
    assert.equal(p.permissions(), 0); await recorder.start(); await recorder.start(); assert.equal(p.permissions(), 1);
    p.setClock(1500); recorder.stop(); await Promise.resolve();
    const result = p.events.find(e => e.name === 'recorded')!.value as AudioMemo;
    assert.equal(result.mimeType, audioMime(mimeType)); assert.equal(result.durationMs, 1500); assert.equal(result.size, 3); assert.equal(p.stops(), 1);
    recorder.dispose(); assert.equal(p.events.filter(e => e.name === 'recorded').length, 1);
  }
});
test('duration limit stops once, size overflow discards the whole container, and unsupported codecs never request the microphone', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const p = platform(), recorder = new MemoRecorder(p.handlers, p.api); await recorder.start(); p.setClock(MEMO_MAX_DURATION_MS); t.mock.timers.tick(250); await Promise.resolve();
  assert.ok(p.events.some(e => e.name === 'limit' && e.value === 'memoDurationLimit')); assert.equal((p.events.find(e => e.name === 'recorded')!.value as AudioMemo).durationMs, MEMO_MAX_DURATION_MS); assert.equal(p.stops(), 1); recorder.dispose();
  const large = platform(), oversize = new MemoRecorder(large.handlers, large.api); await oversize.start(); large.recorder().emit(MEMO_MAX_BYTES + 1); await Promise.resolve();
  assert.ok(large.events.some(e => e.name === 'error' && e.value === 'memoSizeLimit')); assert.ok(!large.events.some(e => e.name === 'recorded')); assert.equal(large.stops(), 1); oversize.dispose();
  const unsupported = platform([]); assert.throws(() => memoMimeType(unsupported.api.Recorder), /memoUnsupported/);
  const absent = new MemoRecorder(unsupported.handlers, unsupported.api); await absent.start(); assert.equal(unsupported.permissions(), 0); assert.ok(unsupported.events.some(e => e.value === 'memoUnsupported'));
});
test('denied permission is localized and a late permission response after lock stops tracks without recording', async () => {
  const denied = platform(); denied.device.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  await new MemoRecorder(denied.handlers, denied.api).start(); assert.ok(denied.events.some(e => e.name === 'error' && e.value === 'memoMicrophoneDenied'));
  const late = platform(); let resolve!: (stream: MediaStream) => void;
  late.device.getUserMedia = () => new Promise(r => { resolve = r; }); const recorder = new MemoRecorder(late.handlers, late.api);
  const pending = recorder.start(); recorder.dispose(); resolve(late.stream); await pending;
  assert.equal(late.stops(), 1); assert.ok(!late.events.some(e => e.name === 'recorded' || e.value === 'recording'));
});
test('privacy lock stops all media synchronously even if another media cleanup throws', () => {
  let stopped = 0; const off = registerMemoMedia(() => { throw new Error('media already gone'); }); const off2 = registerMemoMedia(() => { stopped++; });
  stopMemoMedia(); assert.equal(stopped, 1); off(); off2(); stopMemoMedia(); assert.equal(stopped, 1);
});
