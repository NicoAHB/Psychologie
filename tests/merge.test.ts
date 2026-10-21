import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateInvoiceNumbers, mergeEnvelopes, mergeVaults, stampChanges } from '../src/lib/merge';
import { emptyVault, uid, type Client, type VaultData, type VaultEnvelope } from '../src/lib/types';

const client = (name: string): Client => ({ id: uid(), name, contact: '', preparation: '', telegramChatId: '', language: 'de', reminderConsent: false, createdAt: '2026-01-01' });
const edit = (data: VaultData, change: (next: VaultData) => void, now: number) => { const next = structuredClone(data); change(next); stampChanges(data, next, now); return next; };

test('stamping marks only what changed and records deletions as tombstones', () => {
  const [a, b] = [client('A'), client('B')]; let data = emptyVault(); data.clients.push(a, b);
  data = edit(data, d => { d.clients.forEach((c, i) => { c.updatedAt = 1; if (i) c.updatedAt = 1; }); }, 1);
  const next = edit(data, d => { d.clients[0].preparation = 'neu'; d.clients.splice(1, 1); }, 50);
  assert.equal(next.clients[0].updatedAt, 50); assert.equal(next.deleted[b.id], 50);
  const untouched = edit(next, () => {}, 99); assert.equal(untouched.clients[0].updatedAt, 50);
});
test('two devices editing different records keep both edits; the same record keeps the newer one', () => {
  const [a, b] = [client('A'), client('B')]; let base = emptyVault(); base.clients.push(a, b); base = edit(base, () => {}, 1);
  base.clients.forEach(c => { c.updatedAt = 1; });
  const phone = edit(base, d => { d.clients[0].preparation = 'vom Handy'; }, 10);
  const tablet = edit(base, d => { d.clients[1].preparation = 'vom Tablet'; d.sessions.push({ id: uid(), clientId: b.id, date: '2026-05-01', time: '10:00', feeCents: 100, paidAt: null, notes: '', tags: [] }); }, 11);
  const merged = mergeVaults(phone, tablet);
  assert.deepEqual(merged.clients.map(c => c.preparation), ['vom Handy', 'vom Tablet']); assert.equal(merged.sessions.length, 1);
  const both = mergeVaults(edit(base, d => { d.clients[0].preparation = 'alt'; }, 20), edit(base, d => { d.clients[0].preparation = 'neu'; }, 30));
  assert.equal(both.clients[0].preparation, 'neu');
  // Merging is symmetric for distinct timestamps.
  assert.deepEqual(mergeVaults(tablet, phone).clients.map(c => c.preparation).sort(), merged.clients.map(c => c.preparation).sort());
});
test('a deletion beats an older edit, a newer edit beats an older deletion, nothing is resurrected', () => {
  const a = client('A'); let base = emptyVault(); base.clients.push({ ...a, updatedAt: 1 });
  const deleted = edit(base, d => { d.clients = []; }, 20);
  const olderEdit = edit(base, d => { d.clients[0].preparation = 'x'; }, 10);
  assert.equal(mergeVaults(olderEdit, deleted).clients.length, 0); assert.equal(mergeVaults(deleted, olderEdit).clients.length, 0);
  const newerEdit = edit(base, d => { d.clients[0].preparation = 'y'; }, 30);
  assert.equal(mergeVaults(deleted, newerEdit).clients.length, 1);
});
test('deleting a client on one device removes its records that the other device still holds', () => {
  const a = client('A'); let base = emptyVault(); base.clients.push({ ...a, updatedAt: 1 });
  base.sessions.push({ id: uid(), clientId: a.id, date: '2026-05-01', time: '10:00', feeCents: 100, paidAt: null, notes: '', tags: [], updatedAt: 1 });
  const gone = edit(base, d => { d.clients = []; d.sessions = []; }, 20);
  const merged = mergeVaults(base, gone); assert.equal(merged.clients.length, 0); assert.equal(merged.sessions.length, 0);
});
test('settings follow the newer copy but autoSync stays a per-device choice', () => {
  const local = emptyVault(); const remote = structuredClone(local); remote.settings = { ...remote.settings, timeZone: 'Europe/Kyiv', updatedAt: 5, autoSync: true };
  const merged = mergeVaults(local, remote); assert.equal(merged.settings.timeZone, 'Europe/Kyiv'); assert.equal(merged.settings.autoSync, false);
});
test('duplicate invoice numbers from two offline devices are detected', () => {
  const data = emptyVault(); const base = { clientId: uid(), issuedAt: '2026-01-01', lines: [], totalCents: 0, recipient: { name: '', address: '' }, language: 'de' as const };
  data.invoices.push({ ...base, id: uid(), number: '2026-001' }, { ...base, id: uid(), number: '2026-001' }, { ...base, id: uid(), number: '2026-002' });
  assert.deepEqual(duplicateInvoiceNumbers(data), ['2026-001']);
});
test('envelope merge keeps the newest passphrase wrap, unites passkeys and never revives a removed one', () => {
  const wrap = (at: number) => ({ iv: 'i', ciphertext: 'c', at });
  const base: VaultEnvelope = { format: 'praxisraum-v2', vaultId: uid(), salt: 'AAAAAAAAAAAAAAAAAAAAAAAA', iterations: 600000, payload: { iv: 'i', ciphertext: 'c' }, wraps: { passphrase: wrap(1) } };
  const key = (credentialId: string) => ({ ...wrap(2), credentialId, prfSalt: 's', label: credentialId });
  const local = { ...base, wraps: { passphrase: wrap(1), passkeys: [key('a'), key('lost')] } };
  const remote = { ...base, salt: 'BBBBBBBBBBBBBBBBBBBBBBBB', wraps: { passphrase: wrap(5), passkeys: [key('b')], removedPasskeys: ['lost'], recovery: wrap(3) } };
  const merged = mergeEnvelopes(local, remote);
  assert.equal(merged.wraps!.passphrase.at, 5); assert.equal(merged.salt, remote.salt);
  assert.deepEqual(merged.wraps!.passkeys!.map(p => p.credentialId).sort(), ['a', 'b']); assert.equal(merged.wraps!.recovery!.at, 3);
  assert.equal(mergeEnvelopes({ ...base, wraps: undefined, format: 'praxisraum-v1' }, remote).format, 'praxisraum-v2');
  assert.equal(mergeEnvelopes(local, { ...base, wraps: undefined, format: 'praxisraum-v1' }), local);
});
