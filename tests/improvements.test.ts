import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { clientExport } from '../src/lib/clientExport';
import { questionnairePdf } from '../src/lib/questionnairePdf';
import { readQuestionnaire } from '../src/lib/questionnaireImport';
import { autoLockMinutes } from '../src/lib/autoLock';
import { cacheRate, cachedRates, loadNbuRate, rateDay } from '../src/lib/rates';
import { commitVaultSnapshot, listSnapshots, readSnapshot, recordSnapshot, SNAPSHOT_WINDOW_MS, historyBlobIds, SNAPSHOT_LIMIT } from '../src/lib/history';
import { deriveKey, randomSalt, encryptVault, decryptVault } from '../src/lib/crypto';
import { readVault, metaDelete } from '../src/lib/db';
import { emptyVault, uid } from '../src/lib/types';

test('a readable ZIP contains every selected-client record and actual files, with safe paths and no other subject or keys', async () => {
  const data = emptyVault(); const id = uid();
  data.clients.push({ id, name: 'Олена Beispiel', createdAt: '2026-01-01', language: 'uk', contact: 'Kontakt', preparation: 'Vorbereitung privat', email: 'olena@example.com', telegramChatId: '', reminderConsent: false, avatarId: 'avatar' }, { id: 'other', name: 'OTHER CLIENT SECRET', createdAt: '2026-01-01', language: 'de', contact: '', preparation: '', telegramChatId: '', reminderConsent: false });
  data.sessions.push({ id: 'session', clientId: id, date: '2026-10-01', time: '14:00', feeCents: 8500, notes: 'Sitzung mit Notiz', paidAt: null, tags: ['Fortschritt'] });
  data.documents.push({ id: 'document', clientId: id, title: 'Aufgabe', createdAt: '2026-10-01', file: { blobId: 'original', fileName: '../../aufgabe.txt', mimeType: 'text/plain', size: 3 }, deliveries: [], returnExpected: true, returns: [{ id: 'return', receivedOn: '2026-10-02', uploadedAt: '2026-10-02', file: { blobId: 'filled', fileName: 'відповідь.txt', mimeType: 'text/plain', size: 3 } }] });
  const loaded: string[] = [];
  const result = await clientExport(data, id, 'de', async blobId => { loaded.push(blobId); return new Blob([`original:${blobId}`]); });
  const files = unzipSync(result.bytes); assert.deepEqual(loaded.sort(), ['avatar', 'filled', 'original']);
  assert.ok(Object.keys(files).every(path => !path.includes('..') && !path.startsWith('/')));
  const allText = Object.values(files).map(bytes => strFromU8(bytes)).join('\n'); assert.match(allText, /Sitzung mit Notiz/); assert.match(allText, /Vorbereitung privat/); assert.doesNotMatch(allText, /OTHER CLIENT SECRET|wraps|ciphertext/);
  assert.equal(JSON.parse(strFromU8(files['daten.json'])).documents[0].returns[0].receivedOn, '2026-10-02');
  assert.match(strFromU8(files['finanzen.csv']), /85/); assert.equal(strFromU8(files['bilder/profil.webp']), 'original:avatar');
  await assert.rejects(() => clientExport(data, id, 'de', async () => { throw new Error('missing'); }), /missing/);
});

test('AcroForm import validates all responses and document identity in both languages without modifying input', async () => {
  const font = await readFile('src/assets/DejaVuSans-Base.ttf');
  for (const language of ['de', 'uk'] as const) for (const kind of ['phq9', 'gad7'] as const) {
    const bytes = await questionnairePdf(kind, language, font, 'original-document');
    await assert.rejects(() => readQuestionnaire(bytes, kind, 'original-document'), /questionnaireImportIncomplete/);
    const pdf = await PDFDocument.load(bytes); const form = pdf.getForm(); const count = kind === 'phq9' ? 9 : 7;
    for (let index = 1; index <= count; index++) form.getRadioGroup(`answer_${index}`).select(String(index % 4));
    form.getTextField('completed_on').setText('21.10.2026');
    const filled = await pdf.save({ updateFieldAppearances: false }); const copy = filled.slice();
    const result = await readQuestionnaire(filled, kind, 'original-document'); assert.equal(result.score, result.answers.reduce((sum, value) => sum + value, 0)); assert.equal(result.completedOn, '2026-10-21'); assert.deepEqual(filled, copy);
    await assert.rejects(() => readQuestionnaire(filled, kind, 'wrong-document'), /questionnaireImportMismatch/);
    await assert.rejects(() => readQuestionnaire(filled, kind === 'phq9' ? 'gad7' : 'phq9', 'original-document'), /questionnaireImportMismatch/);
    form.getRadioGroup('answer_1').clear(); await assert.rejects(async () => readQuestionnaire(await pdf.save({ updateFieldAppearances: false }), kind, 'original-document'), /questionnaireImportIncomplete/);
  }
  await assert.rejects(() => readQuestionnaire(new TextEncoder().encode('%PDF-fake'), 'phq9', 'id'), /questionnaireImportInvalid/);
});

test('local encrypted checkpoints commit with the live vault, retain deletions and prune unused shared files', async () => {
  const salt = randomSalt(); const key = await deriveKey('a very strong test passphrase', salt); const id = uid(); const data = emptyVault(); data.settings.practice.name = 'SECRET PRACTICE';
  const envelope = await encryptVault(key, data, id, salt); const at = 10_000_000;
  await commitVaultSnapshot(envelope, ['shared-image'], at); await commitVaultSnapshot(envelope, ['shared-image', 'new-image'], at + 1);
  assert.equal((await listSnapshots(id)).length, 1); assert.deepEqual(await readVault(), envelope); assert.doesNotMatch(JSON.stringify(await readSnapshot(id, at + 1)), /SECRET PRACTICE/);
  assert.equal((await decryptVault(key, (await readSnapshot(id, at + 1))!)).settings.practice.name, 'SECRET PRACTICE');
  await recordSnapshot(envelope, true, at + 2, ['shared-image', 'new-image']); await commitVaultSnapshot(envelope, [], at + 3);
  assert.ok((await historyBlobIds(id)).has('shared-image'));
  let discarded: string[] = [];
  for (let index = 1; index <= SNAPSHOT_LIMIT + 1; index++) discarded.push(...await commitVaultSnapshot(envelope, [], at + index * SNAPSHOT_WINDOW_MS));
  assert.equal((await listSnapshots(id)).length, SNAPSHOT_LIMIT); assert.ok(discarded.includes('shared-image')); assert.equal((await historyBlobIds(id)).size, 0);
});

test('NBU uses a dated IndexedDB fallback, caches successful public rates and fails clearly when no rate exists', async () => {
  await metaDelete('public:nbu:EUR-UAH:v1');
  const offline = (async () => { throw new Error('offline'); }) as typeof fetch;
  await assert.rejects(() => loadNbuRate(undefined, true, offline), /rateLoadFailed/);
  await cacheRate({ micros: 48000000, date: '2026-01-01', source: 'nbu' }); await cacheRate({ micros: 49000000, date: '2026-02-01', source: 'nbu' });
  const result = await loadNbuRate(undefined, true, offline); assert.equal(result.cached, true); assert.equal(result.rate.date, '2026-02-01');
  const day = rateDay(); const [y, m, d] = day.split('-'); let calls = 0;
  const request = (async () => { calls++; return Response.json([{ cc: 'EUR', r030: 978, rate: 50, exchangedate: `${d}.${m}.${y}` }]); }) as typeof fetch;
  const live = await loadNbuRate(undefined, true, request); assert.equal(live.cached, false); assert.equal(live.rate.micros, 50000000);
  const cached = await loadNbuRate(undefined, false, request); assert.equal(cached.rate.date, day); assert.equal(cached.cached, true); assert.equal(calls, 1); assert.equal((await cachedRates())[0].date, day);
  const manual = await loadNbuRate({ micros: 51000000, date: day, source: 'manual' }, true, offline); assert.equal(manual.rate.date, day);
});
test('lock duration supports 60/90 minute sessions and defaults safely for legacy or invalid settings', () => {
  assert.equal(autoLockMinutes(undefined), 10); assert.equal(autoLockMinutes(0), 10); assert.equal(autoLockMinutes(Infinity), 10); assert.equal(autoLockMinutes(60), 60); assert.equal(autoLockMinutes(90), 90);
});
