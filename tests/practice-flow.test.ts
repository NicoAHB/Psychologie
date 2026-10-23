import test from 'node:test';
import assert from 'node:assert/strict';
import { completeAndPay, setupItems } from '../src/lib/practiceFlow';
import { emptyVault, normalizeVault, type SessionDraft, type Client } from '../src/lib/types';
import { today } from '../src/lib/dates';
import { syncConflicts } from '../src/lib/crdt';
import { stampChanges, mergeVaults } from '../src/lib/merge';
import { deleteClient, deleteSession } from '../src/lib/records';
import { deriveKey, randomSalt, encryptVault, decryptVault } from '../src/lib/crypto';
import { clientExport } from '../src/lib/clientExport';
import { unzipSync, strFromU8 } from 'fflate';
function fixture() {
  const data = emptyVault(); data.clients.push({ id: 'c', name: 'Test', language: 'de', createdAt: today(), preparation: '', contact: '', telegramChatId: '', reminderConsent: false } satisfies Client);
  data.appointments.push({ id: 'a', clientId: 'c', date: today(), time: '12:00', duration: 50, timeZone: 'Europe/Berlin', reminderId: 'r', status: 'scheduled', feeCents: 8500 });
  return data;
}
test('quick payment preserves appointment pricing, currency and exact receipt method; retries are idempotent', () => {
  const data = fixture(); data.appointments[0].billing = { currency: 'UAH', amountCents: 400000, rate: { micros: 47000000, date: today(), source: 'manual' } };
  const s = completeAndPay(data, 'a', 'cash'); assert.equal(s.paidAt, today()); assert.equal(s.paymentMethod, 'cash'); assert.equal(s.feeCents, 8500); assert.deepEqual(s.billing, data.appointments[0].billing); assert.equal(s.notes, '');
  assert.equal(completeAndPay(data, 'a', 'transfer').paymentMethod, 'cash'); assert.equal(data.sessions.length, 1); assert.equal(data.appointments[0].status, 'completed');
});
test('quick completion refuses missing/cancelled appointments, open charges and unfinished note drafts', () => {
  const data = fixture(); assert.throws(() => completeAndPay(data, 'missing', 'cash'));
  data.appointments[0].status = 'cancelled'; assert.throws(() => completeAndPay(data, 'a', 'cash'), /quickPaymentUnavailable/);
  data.appointments[0].status = 'scheduled'; data.sessionDrafts.push({ id: 'd', appointmentId: 'a' } as SessionDraft); assert.throws(() => completeAndPay(data, 'a', 'cash'), /quickPaymentDraft/); assert.equal(data.sessions.length, 0);
  data.sessionDrafts = []; completeAndPay(data, 'a', 'cash').paidAt = null; assert.throws(() => completeAndPay(data, 'a', 'cash'), /quickPaymentUnavailable/);
});
test('offline quick completions coalesce, retain competing payment methods and preserve unrelated notes', () => {
  const base = fixture(); stampChanges(emptyVault(), base, 1, 'base'); const a = structuredClone(base), b = structuredClone(base);
  completeAndPay(a, 'a', 'cash'); completeAndPay(b, 'a', 'transfer'); b.clients[0].preparation = 'Notiz'; stampChanges(base, a, 2, 'a'); stampChanges(base, b, 3, 'b');
  const merged = mergeVaults(a, b); assert.equal(merged.sessions.length, 1); assert.equal(merged.clients[0].preparation, 'Notiz'); assert.ok(syncConflicts(merged).some(c => c.collection === 'sessions' && c.field === '$amount'));
});
test('legacy defaults, encrypted backup, readable client export and erasure preserve payment semantics', async () => {
  const data = fixture(); assert.equal(normalizeVault(data).settings.skipCloudSetup, undefined); const s = completeAndPay(data, 'a', 'transfer');
  const salt = randomSalt(), key = await deriveKey('long test passphrase', salt), envelope = await encryptVault(key, data, crypto.randomUUID(), salt); assert.ok(!JSON.stringify(envelope).includes('transfer'));
  const restored = await decryptVault(key, envelope); assert.equal(restored.sessions[0].paymentMethod, 'transfer');
  const zip = await clientExport(data, 'c', 'de', async () => new Blob()); const files = unzipSync(zip.bytes); assert.match(strFromU8(files['finanzen.csv']), /Überweisung/); assert.match(strFromU8(files['daten.json']), /paymentMethod/);
  deleteSession(restored, s.id); assert.equal(restored.appointments[0].status, 'scheduled'); assert.equal(restored.sessions.length, 0); deleteClient(data, 'c'); assert.equal(data.sessions.length, 0); assert.equal(data.appointments.length, 0);
});
test('setup checklist uses real completion states and optional explicit deferrals', () => {
  const data = fixture(); assert.equal(setupItems(data.settings, null).filter(i => i.done).length, 0);
  Object.assign(data.settings.practice, { name: 'Praxis', address: 'Adresse', ibanUa: 'UA123' }); data.settings.skipCloudSetup = true; data.settings.skipReminderSetup = true;
  assert.ok(setupItems(data.settings, { kind: 'share', at: Date.now() }).every(i => i.done)); assert.equal(setupItems(data.settings, undefined).find(i => i.id === 'backup')?.done, false);
});
