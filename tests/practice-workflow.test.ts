import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, normalizeVault, uid, type SessionDraft, type VaultData } from '../src/lib/types';
import { clientStatus, changeClientStatus } from '../src/lib/clientStatus';
import { deleteAudioMemo, deleteClient, deleteSession } from '../src/lib/records';
import { referencedBlobs } from '../src/lib/blobs';
import { latestChange, backupNeeded } from '../src/lib/backupState';
import { stampChanges, mergeVaults } from '../src/lib/merge';
import { saveSessionDraft, deleteSessionDraft } from '../src/lib/sessionDrafts';
import { workItems } from '../src/lib/workItems';
import { memoLabelChoices, removeMemoLabel, renameMemoLabel } from '../src/lib/memoLabels';
import { decryptVault, deriveKey, encryptBytes, encryptVault, randomSalt } from '../src/lib/crypto';
import { verifyBackup } from '../src/lib/verifyBackup';

export function draftFixture() {
  const data = emptyVault(), client = { id: uid(), name: 'Testperson', language: 'de' as const, createdAt: '2025-01-01', contact: '', telegramChatId: '', reminderConsent: false, preparation: '' };
  data.clients.push(client);
  const draft: SessionDraft = { id: uid(), clientId: client.id, sessionId: uid(), savedAt: '2026-10-23T12:00:00.000Z', payload: { date: '2026-10-23', time: '10:00', fee: '85', inputCurrency: 'EUR', paid: false, paymentDate: '2026-10-23', notes: 'Vertraulicher Entwurf', tags: '', homework: '', homeworkDone: false, nextTopics: '', nextTouched: false, reviewPrevious: false, pricingChanged: false, photos: [{ blobId: uid(), fileName: 'foto.webp', mimeType: 'image/webp', size: 3 }], memos: [{ id: uid(), clientId: client.id, sessionId: uid(), blobId: uid(), createdAt: '2026-10-23T12:00:00.000Z', mimeType: 'audio/mp4', size: 3, durationMs: 3000, label: 'Gedanke', summary: 'Manuell' }], removedPhotos: [], removedMemos: [], editedMemos: {} } };
  return { data, client, draft };
}
test('legacy clients stay active; a year-long pause and reactivation preserve all clinical and financial data', () => {
  const { data, client } = draftFixture(); data.sessions.push({ id: uid(), clientId: client.id, date: '2025-01-01', time: '10:00', feeCents: 8500, notes: 'Alte Sitzung', paidAt: '2025-01-02', tags: [] });
  assert.equal(clientStatus(client), 'active'); const before = structuredClone(data.sessions);
  changeClientStatus(client, 'paused', '2025-10-23T12:00:00Z'); changeClientStatus(client, 'active', '2026-10-23T12:00:00Z');
  assert.equal(clientStatus(client), 'active'); assert.deepEqual(data.sessions, before);
  assert.deepEqual(data.clients[0].statusHistory?.map(e => e.status), ['active', 'paused', 'active']);
  const legacy = structuredClone(data) as VaultData; delete (legacy as Partial<VaultData>).sessionDrafts; assert.deepEqual(normalizeVault(legacy).sessionDrafts, []);
});
test('drafts retain encrypted-file references; deleting a session/client removes its unfinished work too', () => {
  const { data, draft, client } = draftFixture(); saveSessionDraft(data, draft);
  assert.deepEqual(new Set(referencedBlobs(data)), new Set([draft.payload.photos[0].blobId, draft.payload.memos[0].blobId]));
  const copy = structuredClone(data); deleteClient(copy, client.id); assert.equal(copy.sessionDrafts.length, 0); assert.equal(referencedBlobs(copy).length, 0);
  draft.originalSessionId = uid(); data.sessions.push({ id: draft.originalSessionId, clientId: client.id, date: '2026-01-01', time: '10:00', notes: '', tags: [], feeCents: 8500, paidAt: null }); saveSessionDraft(data, draft);
  deleteSession(data, draft.originalSessionId); assert.equal(data.sessionDrafts.length, 0);
});
test('offline drafts and status events merge; erased drafts and memo bytes cannot return from a stale device', () => {
  const { data: base, client, draft } = draftFixture(); const a = structuredClone(base), b = structuredClone(base);
  saveSessionDraft(a, draft); changeClientStatus(a.clients[0], 'paused', '2026-01-01'); stampChanges(base, a, 1, 'a');
  b.clients[0].contact = 'Neue Nummer'; changeClientStatus(b.clients[0], 'closed', '2026-02-01'); stampChanges(base, b, 2, 'b');
  const joined = mergeVaults(a, b); assert.equal(joined.sessionDrafts.length, 1); assert.equal(joined.clients[0].contact, 'Neue Nummer'); assert.equal(joined.clients[0].statusHistory?.length, 3);
  const before = structuredClone(joined); deleteAudioMemo(joined, draft.payload.memos[0].id); stampChanges(before, joined, 3, 'a');
  const erased = mergeVaults(joined, a); assert.equal(erased.sessionDrafts[0].payload.memos.length, 0); assert.ok(!referencedBlobs(erased).includes(draft.payload.memos[0].blobId)); assert.ok(!JSON.stringify(erased).includes('Manuell'));
  const old = structuredClone(erased); deleteSessionDraft(erased, draft.id); stampChanges(old, erased, 4, 'a'); assert.equal(mergeVaults(erased, a).sessionDrafts.length, 0);
  assert.ok(client.id);
});
test('backup warning includes new memos, settings and session drafts after an older external backup', () => {
  const { data, draft } = draftFixture(); const at = Date.parse('2026-10-01T00:00:00Z'); data.audioMemos.push({ ...draft.payload.memos[0], updatedAt: at + 1 });
  assert.equal(latestChange(data), at + 1); assert.equal(backupNeeded({ at, kind: 'auto' }, latestChange(data), true, at + 8 * 864e5).needed, true);
  data.sessionDrafts.push({ ...draft, updatedAt: at + 2 }); assert.equal(latestChange(data), at + 2); data.settings.updatedAt = at + 3; assert.equal(latestChange(data), at + 3);
});
test('vocabulary favorites, rename and removal do not touch existing memo titles and merge offline additions', () => {
  const { data, draft } = draftFixture(); data.audioMemos.push(draft.payload.memos[0]); data.settings.memoLabels = ['Gedanke']; data.settings.memoLabelFavorites = ['own:gedanke'];
  renameMemoLabel(data, 'Gedanke', 'Ressource'); assert.equal(data.audioMemos[0].label, 'Gedanke'); assert.deepEqual(data.settings.memoLabelFavorites, ['own:ressource']);
  assert.equal(memoLabelChoices(data.settings.memoLabels, 'de', data.settings.memoLabelFavorites)[0].label, 'Ressource');
  removeMemoLabel(data, 'Ressource'); assert.deepEqual(data.settings.memoLabelFavorites, []); assert.equal(data.audioMemos[0].label, 'Gedanke');
  const a = structuredClone(data), b = structuredClone(data); a.settings.memoLabelFavorites = ['memoLabelGoals']; b.settings.memoLabelFavorites = ['memoLabelResources']; stampChanges(data, a, 1, 'a'); stampChanges(data, b, 1, 'b'); assert.deepEqual(new Set(mergeVaults(a, b).settings.memoLabelFavorites), new Set(['memoLabelGoals', 'memoLabelResources']));
});
test('work items point to unfinished records and disappear when documented, invoiced or reviewed', () => {
  const { data, draft } = draftFixture(); data.clients[0].followUpOn = '2026-10-22'; data.sessions.push({ id: uid(), clientId: draft.clientId, date: '2026-10-22', time: '10:00', notes: '', tags: [], feeCents: 8500, paidAt: null });
  saveSessionDraft(data, draft); const items = workItems(data, new Date('2026-10-23T12:00:00Z'));
  assert.deepEqual(new Set(items.map(e => e.kind)), new Set(['draft', 'followUp', 'session', 'invoice']));
  data.sessions[0].notes = 'Dokumentiert'; data.sessions[0].invoiceId = 'invoice'; delete data.clients[0].followUpOn; deleteSessionDraft(data, draft.id); assert.equal(workItems(data, new Date('2026-10-23T12:00:00Z')).length, 0);
});
test('backup rehearsal decrypts legacy vault, unfinished notes and all attachments without changing the source', async () => {
  const { data, draft } = draftFixture(); saveSessionDraft(data, draft); const salt = randomSalt(), id = uid(), key = await deriveKey('Sicherungspassphrase', salt);
  const envelope = await encryptVault(key, data, id, salt); const blobs = await Promise.all(referencedBlobs(data).map(async blobId => ({ id: blobId, vaultId: id, payload: await encryptBytes(key, new Uint8Array([1, 2, 3]), `praxisraum-blob:v1:${id}:${blobId}`) })));
  const backup = { type: 'praxisraum-backup-v1', envelope, blobs }, before = JSON.stringify(backup);
  assert.deepEqual(await verifyBackup(backup, 'Sicherungspassphrase'), { vaultId: envelope.vaultId, clients: 1, sessions: 0, drafts: 1, files: 2 }); assert.equal(JSON.stringify(backup), before); assert.equal((await decryptVault(key, envelope)).sessionDrafts[0].payload.notes, draft.payload.notes);
  await assert.rejects(() => verifyBackup(backup, 'Falsch')); await assert.rejects(() => verifyBackup({ ...backup, blobs: blobs.slice(1) }, 'Sicherungspassphrase'));
  const damaged = structuredClone(backup); damaged.blobs[0].payload.ciphertext = damaged.blobs[0].payload.ciphertext.slice(0, -4) + 'AAAA'; await assert.rejects(() => verifyBackup(damaged, 'Sicherungspassphrase'));
});
