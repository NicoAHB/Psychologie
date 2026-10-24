import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { emptyVault, normalizeVault, uid, type Client, type VaultData } from '../src/lib/types';
import { deleteFollowUp, finishFollowUp, followUpRows, matchesFollowUp, saveFollowUp } from '../src/lib/followUpTasks';
import { clientDuplicateIndex, DuplicateClientReviewRequired, possibleClientDuplicates, requireClientDuplicateReview } from '../src/lib/clientDuplicates';
import { invoiceChecks } from '../src/lib/invoiceChecks';
import { contactHistory } from '../src/lib/contactHistory';
import { stampChanges, mergeVaults } from '../src/lib/merge';
import { stateOf, syncConflicts } from '../src/lib/crdt';
import { deleteClient } from '../src/lib/records';
import { clientExport } from '../src/lib/clientExport';
import { decryptVault, deriveKey, encryptVault, randomSalt } from '../src/lib/crypto';
import { verifyBackup } from '../src/lib/verifyBackup';

const client = (id: string, name = 'Testperson'): Client => ({ id, name, language: 'de', contact: '', email: '', preparation: '', telegramChatId: '', reminderConsent: false, createdAt: '2025-01-01' });
function fixture() { const data = emptyVault(); data.clients.push(client('a'), client('b', 'Andere Person')); data.crdt = stateOf(data); return data; }
function edit(base: VaultData, actor: string, work: (data: VaultData) => void) { const next = structuredClone(base); work(next); stampChanges(base, next, 100, actor); return next; }
const task = (id: string, dueOn = '2026-10-24') => ({ id, clientId: 'a', dueOn, note: 'Interne Rücksprache', createdAt: '2026-10-20T12:00:00Z' });

test('old reminders remain virtual, missing collections default safely and new tasks coexist', () => {
  const data = fixture(); data.clients[0].followUpOn = '2026-10-24'; data.clients[0].followUpNote = 'Bisheriger Anlass';
  delete (data as Partial<VaultData>).followUps;
  const migrated = normalizeVault(data); assert.equal(migrated.followUps.length, 0);
  saveFollowUp(migrated, task('new'));
  assert.equal(followUpRows(migrated).length, 2);
  assert.equal(migrated.clients[0].followUpNote, 'Bisheriger Anlass');
  assert.equal(migrated.followUps.some(t => t.id.startsWith('legacy-')), false);
});
test('follow-up filters handle Monday/Sunday, overdue items, month boundaries and later tasks', () => {
  const day = '2026-11-01'; // Sunday, with the preceding week in October.
  assert.equal(matchesFollowUp({ dueOn: '2026-10-31' }, 'overdue', day), true);
  assert.equal(matchesFollowUp({ dueOn: day }, 'today', day), true);
  assert.equal(matchesFollowUp({ dueOn: '2026-10-26' }, 'week', day), true);
  assert.equal(matchesFollowUp({ dueOn: '2026-11-02' }, 'week', day), false);
  assert.equal(matchesFollowUp({ dueOn: '2026-11-02' }, 'later', day), true);
});
test('finishing, editing and deleting one follow-up leave other reminders and legacy notes intact', () => {
  const data = fixture(); data.clients[0].followUpOn = '2026-10-24'; data.clients[0].followUpNote = 'Alte Notiz';
  saveFollowUp(data, task('one')); saveFollowUp(data, task('two'));
  saveFollowUp(data, { ...task('one'), dueOn: '2026-11-02' });
  finishFollowUp(data, task('two'), '2026-10-24T12:00:00Z'); finishFollowUp(data, task('two'));
  assert.equal(data.followUps.find(t => t.id === 'two')?.completedAt, '2026-10-24T12:00:00Z');
  const legacy = followUpRows(data).find(t => t.legacy)!; finishFollowUp(data, legacy);
  assert.equal(data.clients[0].followUpOn, undefined); assert.equal(data.clients[0].followUpNote, 'Alte Notiz');
  deleteFollowUp(data, task('one')); assert.equal(followUpRows(data).length, 0);
});
test('invalid follow-up dates, empty reasons and foreign/deleted owners are rejected', () => {
  const data = fixture();
  for (const row of [{ ...task('x'), dueOn: '2026-02-30' }, { ...task('x'), note: '' }, { ...task('x'), clientId: 'missing' }, { ...task('x'), note: 'x'.repeat(501) }]) assert.throws(() => saveFollowUp(data, row), /followUpTaskRequired/);
  data.deleted.x = 1; assert.throws(() => saveFollowUp(data, task('x')), /storageError/);
});
test('offline follow-ups merge independently and a deleted task cannot return from a stale device', () => {
  const base = fixture(), a = edit(base, 'ipad', d => saveFollowUp(d, task('one'))), b = edit(base, 'phone', d => saveFollowUp(d, task('two')));
  const merged = mergeVaults(a, b); assert.equal(followUpRows(merged).length, 2);
  const removed = edit(merged, 'ipad', d => deleteFollowUp(d, task('one')));
  assert.deepEqual(followUpRows(mergeVaults(removed, a)).map(t => t.id), ['two']);
  const x = edit(merged, 'x', d => saveFollowUp(d, { ...task('two'), note: 'Rücksprache A' }));
  const y = edit(merged, 'y', d => saveFollowUp(d, { ...task('two'), note: 'Rücksprache B' }));
  assert.equal(syncConflicts(mergeVaults(x, y)).find(c => c.collection === 'followUps' && c.field === 'note')?.variants.length, 2);
});
test('client erasure scrubs follow-ups including hidden causal alternatives', () => {
  const base = edit(fixture(), 'ipad', d => saveFollowUp(d, { ...task('one'), note: 'Secret follow-up' }));
  const erased = edit(base, 'ipad', d => deleteClient(d, 'a'));
  const merged = mergeVaults(erased, base); assert.equal(merged.followUps.length, 0);
  assert.ok(!JSON.stringify(merged).includes('Secret follow-up'));
});
test('encrypted backups and client exports retain follow-ups, scoped to the selected client', async () => {
  const data = fixture(); saveFollowUp(data, task('one')); saveFollowUp(data, { ...task('two'), clientId: 'b', note: 'Other private reminder' });
  const passphrase = 'synthetic backup passphrase', salt = randomSalt(), key = await deriveKey(passphrase, salt);
  const envelope = await encryptVault(key, data, uid(), salt);
  assert.ok(!JSON.stringify(envelope).includes('Interne Rücksprache'));
  await verifyBackup({ type: 'praxisraum-backup-v1', envelope, blobs: [] }, passphrase);
  assert.equal((await decryptVault(key, envelope)).followUps.length, 2);
  const result = await clientExport(data, 'a', 'de', async () => { throw new Error(); });
  const zip = unzipSync(result.bytes), json = JSON.parse(strFromU8(zip['daten.json']));
  assert.equal(json.followUps.length, 1); assert.ok(!strFromU8(zip['wiedervorlagen.json']).includes('Other private reminder'));
});

test('duplicate matching recognises normalized email/phone, reordered names and a single typo', () => {
  const anna = { ...client('anna', 'Anna Müller'), email: 'anna@example.com', contact: '+49 (170) 1234567', birthday: '1990-01-01', status: 'paused' as const };
  const index = clientDuplicateIndex([anna]);
  assert.ok(possibleClientDuplicates(index, { name: '', email: ' ANNA@example.com ', contact: '' })[0].reasons.includes('email'));
  assert.ok(possibleClientDuplicates(index, { name: '', email: '', contact: 'Telefon: 0049 170 1234567' })[0].reasons.includes('phone'));
  assert.ok(possibleClientDuplicates(index, { name: 'Müller, Anna', email: '', contact: '' })[0].reasons.includes('name'));
  assert.ok(possibleClientDuplicates(index, { name: 'Anna Müler', email: '', contact: '', birthday: '1990-01-01' })[0].reasons.includes('birthday'));
  assert.equal(possibleClientDuplicates(index, { name: 'Unrelated Person', email: '', contact: '', birthday: '1990-01-01' }).length, 0);
});
test('duplicate suggestions are bounded and never modify the underlying records', () => {
  const clients = Array.from({ length: 25 }, (_, i) => client(String(i), 'Anna Müller')), before = structuredClone(clients);
  assert.equal(possibleClientDuplicates(clientDuplicateIndex(clients), { name: 'Anna Müller', contact: '', email: '' }).length, 5);
  assert.deepEqual(clients, before);
  const dated = clientDuplicateIndex([{ ...client('dated'), contact: '2026-10-24' }, { ...client('local'), contact: '24.10.2026' }]);
  assert.equal(possibleClientDuplicates(dated, { name: 'Anderer Name', email: '', contact: '2026-10-24' }).length, 0);
  assert.equal(possibleClientDuplicates(dated, { name: 'Anderer Name', email: '', contact: '24.10.2026' }).length, 0);
});
test('saving a name-only duplicate requires explicit review and leaves stored records unchanged', () => {
  const clients = [client('nico', 'Nico von Felde')], before = structuredClone(clients);
  const input = { name: '  nico VON   Felde ', email: '', contact: '' };
  assert.throws(() => requireClientDuplicateReview(clients, input), error => error instanceof DuplicateClientReviewRequired && error.matches[0].client.id === 'nico');
  assert.doesNotThrow(() => requireClientDuplicateReview(clients, input, ['nico']));
  assert.deepEqual(clients, before);
  assert.doesNotThrow(() => requireClientDuplicateReview(clients, { name: 'Ganz andere Person', email: '', contact: '' }));
});
test('a newly matching record requires review again at the serialized write, regardless of an earlier check', () => {
  const input = { name: 'Nico von Felde', email: '', contact: '' }, clients = [client('first', input.name)];
  assert.doesNotThrow(() => requireClientDuplicateReview([], input));
  assert.throws(() => requireClientDuplicateReview(clients, input), DuplicateClientReviewRequired);
  clients.push(client('second', input.name));
  assert.throws(() => requireClientDuplicateReview(clients, input, ['first']), error => error instanceof DuplicateClientReviewRequired && error.matches.some(match => match.client.id === 'second'));
  assert.doesNotThrow(() => requireClientDuplicateReview(clients, input, ['first', 'second']));
});
test('invoice checks select the currency account and inspect immutable issued snapshots', () => {
  const data = fixture(), sender = { ...data.settings.practice, name: 'Praxis', address: 'Praxisweg 1', iban: 'DE-TEST', ibanUa: 'UA-TEST' };
  const source = { sender, recipient: { name: 'Person', address: 'Адреса' }, currency: 'UAH' as const };
  assert.equal(invoiceChecks(source).account.iban, 'UA-TEST'); assert.equal(invoiceChecks(source).issues.length, 0);
  const snapshot = { ...source, paymentAccount: { holder: '', iban: '', bank: '', bic: '' } };
  assert.ok(invoiceChecks(snapshot).issues.includes('bank')); assert.equal(snapshot.sender.ibanUa, 'UA-TEST');
  assert.deepEqual(invoiceChecks({ ...source, recipient: { name: '', address: '' } }).issues, ['recipientName', 'recipientAddress']);
  assert.ok(!invoiceChecks({ ...snapshot, kind: 'cancellation' }).issues.includes('bank'));
});

test('contact history includes only this client’s receipts and returns, newest first', () => {
  const data = fixture();
  data.documents.push({ id: 'doc', clientId: 'a', title: 'Aufgabe', createdAt: '2026-10-20T10:00:00Z', file: { blobId: 'blob', fileName: 'aufgabe.pdf', size: 1, mimeType: 'application/pdf' }, returnExpected: true,
    deliveries: [{ id: 'e', recipient: 'a@example.com', requestedAt: '2026-10-20T10:00:00Z', acceptedAt: '2026-10-20T10:01:00Z', subject: 'Ihre Aufgabe', body: 'Text' }],
    telegramDeliveries: [{ id: 'tg', recipient: '123', requestedAt: '2026-10-21T10:00:00Z', text: 'Unbestätigt' }],
    returns: [{ id: 'r', receivedOn: '2026-10-23', uploadedAt: '2026-10-24T10:00:00Z', file: { blobId: 'return', fileName: 'ausgefüllt.pdf', size: 1, mimeType: 'application/pdf' } }] });
  data.documents.push({ ...structuredClone(data.documents[0]), id: 'other', clientId: 'b', title: 'Other secret' });
  const events = contactHistory(data, 'a'); assert.equal(events.length, 3);
  assert.deepEqual(events.map(e => e.status), ['received', 'unconfirmed', 'sent']);
  assert.equal(events[0].dateOnly, true); assert.ok(!JSON.stringify(events).includes('Other secret'));
  assert.deepEqual(contactHistory(data, 'missing'), []);
});
test('merely generating a document is not contact and pending messages are not called sent', () => {
  const data = fixture(); data.documents.push({ id: 'copy', clientId: 'a', invoiceId: 'invoice', title: 'Invoice', createdAt: '2026-10-20', file: { blobId: 'x', fileName: 'invoice.pdf', mimeType: 'application/pdf', size: 1 }, returnExpected: false, deliveries: [], returns: [] });
  assert.equal(contactHistory(data, 'a').length, 0);
  data.newsletters.push({ id: 'n', createdAt: '2026-10-24T12:00:00Z', channel: 'email', messages: [{ id: 'm', title: 'DE', content: 'DE body', titleUk: 'UA', contentUk: 'UA body' }], recipients: [{ id: 'r', clientId: 'a', consentId: 'c', messageId: 'm', language: 'uk', channel: 'email', status: 'sending', requestedAt: '2026-10-24T12:00:00Z' }], recipientCount: 1, status: 'sending' });
  const event = contactHistory(data, 'a')[0]; assert.equal(event.status, 'unconfirmed'); assert.equal(event.title, 'UA'); assert.equal(event.body, 'UA body');
});
