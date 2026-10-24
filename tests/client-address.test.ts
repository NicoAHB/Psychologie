import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { emptyPostalAddress, editablePostalAddress, formatPostalAddress, validPostalCode } from '../src/lib/clientAddress';
import { emptyVault, normalizeVault, uid, type ClientPostalAddress, type VaultData } from '../src/lib/types';
import { materialize, recordChanges, resolveConflict, stateOf, syncConflicts } from '../src/lib/crdt';
import { mergeVaults } from '../src/lib/merge';
import { buildInvoice } from '../src/lib/invoice';
import { deleteClient } from '../src/lib/records';
import { decryptVault, deriveKey, encryptVault, randomSalt } from '../src/lib/crypto';
import { verifyBackup } from '../src/lib/verifyBackup';
import { clientExport } from '../src/lib/clientExport';

const de: ClientPostalAddress = { ...emptyPostalAddress('Deutschland'), street: 'Musterstraße 12a', postalCode: '01067', city: 'Dresden' };
const ua: ClientPostalAddress = { ...emptyPostalAddress('Україна'), street: 'вул. Хрещатик, буд. 22', additional: 'кв. 12', city: 'Київ', region: 'Київська область', postalCode: '01001' };
function fixture() {
  const data = emptyVault();
  data.clients.push({ id: 'client', name: 'Fiktive Person', language: 'uk', contact: '', preparation: '', telegramChatId: '', reminderConsent: false, createdAt: '2026-01-01', address: 'Alte Straße 1\n10115 Berlin', followUpOn: '2026-10-24', followUpNote: 'Notiz erhalten' });
  data.crdt = stateOf(data); return data;
}
function edit(base: VaultData, actor: string, work: (data: VaultData) => void) {
  const next = structuredClone(base); work(next); recordChanges(base, next, 100, actor); return next;
}

test('German and Ukrainian postal order preserves Cyrillic, apartment details and leading zeroes', () => {
  assert.equal(formatPostalAddress(de), 'Musterstraße 12a\n01067 Dresden\nDeutschland');
  assert.equal(formatPostalAddress(ua), 'вул. Хрещатик, буд. 22\nкв. 12\nКиїв\nКиївська область\n01001\nУкраїна');
  assert.equal(formatPostalAddress({ ...ua, country: 'Ukraine' }), formatPostalAddress(ua).replace('Україна', 'Ukraine'));
  assert.equal(formatPostalAddress(emptyPostalAddress('Deutschland')), '');
  assert.equal(validPostalCode(ua), true);
  assert.equal(validPostalCode({ ...ua, postalCode: '1001' }), false);
  assert.equal(validPostalCode({ ...ua, postalCode: '' }), true);
  assert.equal(validPostalCode({ ...de, country: 'Canada', postalCode: 'K1A 0B1' }), true);
});

test('old free-text addresses remain lossless; only clearly recognisable lines are split', () => {
  assert.deepEqual(editablePostalAddress({ address: formatPostalAddress(de) }).value, de);
  const simpleUa = { ...ua, additional: '' };
  assert.deepEqual(editablePostalAddress({ address: formatPostalAddress(simpleUa) }).value, simpleUa);
  const legacy = 'До запитання\nМісце отримання\nДодаткові відомості';
  assert.equal(editablePostalAddress({ address: legacy }).value.additional, legacy);
  assert.equal(editablePostalAddress({ address: legacy }).legacy, true);
  const data = fixture(); data.clients[0].address = legacy;
  assert.equal(normalizeVault(data).clients[0].address, legacy);
  assert.equal(normalizeVault(data).clients[0].postalAddress, undefined);
  const partial = { ...emptyPostalAddress('Україна'), city: 'Львів' };
  assert.deepEqual(editablePostalAddress({ postalAddress: partial, address: 'Outdated printed copy' }).value, partial);
});

test('a cleared follow-up date survives unrelated offline edits and a stale device without losing its note', () => {
  const base = fixture();
  const cleared = edit(base, 'ipad', d => { d.clients[0].followUpOn = undefined; });
  const phone = edit(base, 'phone', d => { d.clients[0].contact = 'Neue Nummer'; });
  const merged = mergeVaults(cleared, phone);
  assert.equal(merged.clients[0].followUpOn, undefined);
  assert.equal(merged.clients[0].followUpNote, 'Notiz erhalten');
  assert.equal(merged.clients[0].contact, 'Neue Nummer');
  assert.equal(mergeVaults(merged, base).clients[0].followUpOn, undefined);
  assert.equal(syncConflicts(merged).length, 0);
});

test('structured addresses merge as one snapshot, keep their printed copy consistent and block conflicting invoices', () => {
  const base = fixture();
  const a = edit(base, 'ipad', d => { d.clients[0].postalAddress = de; d.clients[0].address = formatPostalAddress(de); });
  const b = edit(base, 'phone', d => { d.clients[0].postalAddress = ua; d.clients[0].address = formatPostalAddress(ua); });
  const merged = mergeVaults(a, b), conflict = syncConflicts(merged).find(c => c.field === 'postalAddress')!;
  assert.equal(conflict.variants.length, 2);
  assert.equal(merged.clients[0].address, formatPostalAddress(merged.clients[0].postalAddress!));
  assert.equal(syncConflicts(merged).some(c => c.field === 'address'), false);
  assert.deepEqual(mergeVaults(a, b), mergeVaults(b, a));
  merged.sessions.push({ id: 'session', clientId: 'client', date: '2026-10-24', time: '10:00', notes: '', tags: [], feeCents: 8500, paidAt: null });
  assert.throws(() => buildInvoice(merged, merged.clients[0], merged.sessions, '2026-10-24', 'uk', uid()), /invoiceWorkflowConflict/);
  const resolved = edit(merged, 'review', d => resolveConflict(d, conflict, conflict.variants.find(v => (v.value as unknown as ClientPostalAddress).country === 'Україна')!));
  const again = mergeVaults(resolved, a);
  assert.equal(again.clients[0].address, formatPostalAddress(ua));
  assert.equal(syncConflicts(again).length, 0);
  const invoice = buildInvoice(again, again.clients[0], again.sessions, '2026-10-24', 'uk', uid());
  assert.equal(invoice.recipient.address, formatPostalAddress(ua));
});

test('erasing the last address field clears its printed copy even when merged with an old snapshot', () => {
  const base = edit(fixture(), 'initial', d => { d.clients[0].postalAddress = de; d.clients[0].address = formatPostalAddress(de); });
  const empty = edit(base, 'ipad', d => { d.clients[0].postalAddress = emptyPostalAddress('Deutschland'); d.clients[0].address = ''; });
  const merged = mergeVaults(empty, base);
  assert.equal(merged.clients[0].address, '');
  assert.equal(materialize(merged, stateOf(merged)).clients[0].address, '');
});

test('edits and clearing from an older app are adopted without overriding a newly edited postal snapshot', () => {
  const base = edit(fixture(), 'initial', d => { d.clients[0].postalAddress = de; d.clients[0].address = formatPostalAddress(de); });
  const olderApp = structuredClone(base);
  const changed = { ...de, street: 'Neue Straße 9', postalCode: '01069' };
  olderApp.clients[0].address = formatPostalAddress(changed);
  let merged = mergeVaults(normalizeVault(olderApp), base);
  assert.deepEqual(merged.clients[0].postalAddress, changed);
  assert.equal(merged.clients[0].address, formatPostalAddress(changed));
  olderApp.clients[0].address = '';
  merged = mergeVaults(normalizeVault(olderApp), base);
  assert.equal(merged.clients[0].address, '');
  assert.equal(merged.clients[0].postalAddress?.postalCode, '');
  const structuredEdit = structuredClone(base);
  structuredEdit.clients[0].postalAddress = ua;
  assert.equal(normalizeVault(structuredEdit).clients[0].address, formatPostalAddress(ua));
});

test('encrypted backup and readable client export contain the full postal snapshot and cleared follow-up date', async () => {
  const data = edit(fixture(), 'ipad', d => { d.clients[0].postalAddress = ua; d.clients[0].address = formatPostalAddress(ua); delete d.clients[0].followUpOn; });
  const salt = randomSalt(), passphrase = 'a strong synthetic passphrase', key = await deriveKey(passphrase, salt);
  const envelope = await encryptVault(key, data, uid(), salt);
  const packageData = { type: 'praxisraum-backup-v1', envelope, blobs: [] };
  assert.ok(!JSON.stringify(packageData).includes(ua.street));
  await verifyBackup(packageData, passphrase);
  const restored = await decryptVault(key, envelope);
  assert.deepEqual(restored.clients[0].postalAddress, ua);
  assert.equal(restored.clients[0].followUpOn, undefined);
  const exported = await clientExport(restored, 'client', 'uk', async () => { throw new Error('No attachments expected'); });
  const zip = unzipSync(exported.bytes), json = JSON.parse(strFromU8(zip['daten.json']));
  assert.deepEqual(json.client.postalAddress, ua);
  assert.equal(json.client.followUpOn, undefined);
  assert.ok(strFromU8(zip['profil.md']).includes(formatPostalAddress(ua)));
});

test('client erasure removes postal data from the visible record and CRDT alternatives', () => {
  const base = edit(fixture(), 'ipad', d => { d.clients[0].postalAddress = ua; d.clients[0].address = formatPostalAddress(ua); });
  const deleted = edit(base, 'ipad', d => deleteClient(d, 'client'));
  const merged = mergeVaults(deleted, base);
  assert.equal(merged.clients.length, 0);
  assert.ok(!JSON.stringify(merged).includes(ua.street));
});
