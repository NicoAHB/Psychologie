import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, uid, type VaultData } from '../src/lib/types';
import { materialize, mergeStates, recordChanges, resolveConflict, stateOf, syncConflicts } from '../src/lib/crdt';
import { mergeVaults } from '../src/lib/merge';
import { referencedBlobs } from '../src/lib/blobs';
import { attachInvoice, billingConflicts, buildInvoice, invoiceOutstanding } from '../src/lib/invoice';

function fixture() {
  const data = emptyVault();
  data.clients.push({ id: 'client', name: 'Private Client', language: 'de', contact: '', preparation: 'Shared starting note', createdAt: '2026-01-01', telegramChatId: '', reminderConsent: false });
  data.sessions.push({ id: 'session', clientId: 'client', date: '2026-10-22', time: '10:00', notes: 'Original', tags: ['start'], feeCents: 8500, paidAt: null });
  data.crdt = stateOf(data); return data;
}
function edit(data: VaultData, actor: string, work: (d: VaultData) => void, at = 100) { const next = structuredClone(data); work(next); recordChanges(data, next, at, actor); return next; }
test('independent fields of one client merge, regardless of clock skew', () => {
  const base = fixture();
  const a = edit(base, 'phone', d => { d.clients[0].preparation = 'New preparation'; }, 999999);
  const b = edit(base, 'laptop', d => { d.clients[0].email = 'private@example.com'; }, 1);
  const result = mergeVaults(a, b); assert.equal(result.clients[0].preparation, 'New preparation'); assert.equal(result.clients[0].email, 'private@example.com'); assert.equal(syncConflicts(result).length, 0);
});
test('same text field retains every offline alternative, with explicit causal resolution', () => {
  const base = fixture(); const a = edit(base, 'phone', d => { d.clients[0].preparation = 'Phone content'; }); const b = edit(base, 'laptop', d => { d.clients[0].preparation = 'Laptop content'; });
  const merged = mergeVaults(a, b); const conflict = syncConflicts(merged).find(c => c.field === 'preparation')!;
  assert.deepEqual(conflict.variants.map(v => v.value).sort(), ['Laptop content', 'Phone content']);
  const resolved = edit(merged, 'therapist', d => resolveConflict(d, conflict, conflict.variants[0], 'Both reviewed and combined'));
  const again = mergeVaults(resolved, a); assert.equal(syncConflicts(again).length, 0); assert.equal(again.clients[0].preparation, 'Both reviewed and combined');
  // Choosing the already displayed variant must resolve too, even with no projected text change.
  const displayed = merged.clients[0].preparation; const chosen = edit(merged, 'therapist', d => resolveConflict(d, conflict, conflict.variants.find(v => v.value === displayed)!));
  assert.equal(syncConflicts(mergeVaults(chosen, b)).length, 0);
});
test('join is commutative, associative and idempotent, including three devices', () => {
  const base = fixture(); const a = edit(base, 'A', d => { d.clients[0].preparation = 'A'; }); const b = edit(base, 'B', d => { d.clients[0].preparation = 'B'; d.sessions[0].notes = 'B note'; }); const c = edit(base, 'C', d => { d.clients[0].email = 'c@example.com'; d.sessions[0].tags.push('C'); });
  const [as, bs, cs] = [a, b, c].map(stateOf);
  assert.deepEqual(mergeStates(as, bs), mergeStates(bs, as));
  assert.deepEqual(mergeStates(mergeStates(as, bs), cs), mergeStates(as, mergeStates(bs, cs)));
  assert.deepEqual(mergeStates(as, as), as);
  assert.deepEqual(mergeVaults(mergeVaults(a, b), c), mergeVaults(a, mergeVaults(b, c)));
});
test('causally later edits supersede earlier text even when the clock runs backwards', () => {
  const a = edit(fixture(), 'A', d => { d.sessions[0].notes = 'Earlier'; }, 50000);
  const b = edit(a, 'A', d => { d.sessions[0].notes = 'Later'; }, 1);
  assert.equal(mergeVaults(a, b).sessions[0].notes, 'Later'); assert.equal(syncConflicts(mergeVaults(a, b)).length, 0);
});
test('editing a visible conflicted text or payment never discards the other offline alternative', () => {
  const base = fixture(), a = edit(base, 'A', d => { d.clients[0].preparation = 'A'; d.sessions[0].feeCents = 9000; }), b = edit(base, 'B', d => { d.clients[0].preparation = 'B'; d.sessions[0].feeCents = 9500; });
  const merged = mergeVaults(a, b); const edited = edit(merged, 'C', d => { d.clients[0].preparation = 'New visible text'; d.sessions[0].paidAt = '2026-10-22'; }, 1);
  const text = syncConflicts(edited).find(c => c.field === 'preparation')!; assert.equal(text.variants.length, 2); assert.ok(text.variants.some(v => v.value === 'New visible text'));
  assert.equal(syncConflicts(mergeVaults(edited, merged)).find(c => c.field === '$amount')!.variants.length, 2);
});
test('observed tag removal and concurrent new tags are both preserved', () => {
  const base = fixture(), a = edit(base, 'A', d => { d.sessions[0].tags = []; }), b = edit(base, 'B', d => { d.sessions[0].tags.push('progress'); });
  assert.deepEqual(mergeVaults(a, b).sessions[0].tags, ['progress']);
});
test('financial tuples and issued invoice snapshots cannot be silently mixed', () => {
  let base = fixture(); const invoice = buildInvoice(base, base.clients[0], base.sessions, '2026-10-22', 'de', uid()); base = edit(base, 'A', d => attachInvoice(d, invoice));
  const a = edit(base, 'A', d => { d.sessions[0].paidAt = '2026-10-22'; }); const b = edit(base, 'B', d => { d.sessions[0].feeCents = 9000; d.sessions[0].billing!.amountCents = 9000; });
  const merged = mergeVaults(a, b); assert.ok(syncConflicts(merged).some(c => c.field === '$amount'));
  assert.equal(invoiceOutstanding(merged, invoice), null); assert.ok(billingConflicts(merged).includes(invoice.number));
  assert.throws(() => buildInvoice(merged, merged.clients[0], merged.sessions, '2026-10-22', 'de', uid()), /invoiceWorkflowConflict/);
  const x = edit(base, 'X', d => { d.invoices[0].totalCents = 9000; d.invoices[0].lines[0].amountCents = 9000; }); const y = edit(base, 'Y', d => { d.invoices[0].recipient.address = 'New address'; });
  const conflict = syncConflicts(mergeVaults(x, y)).find(c => c.field === '$snapshot')!; assert.equal(conflict.variants.length, 2);
});
test('concurrent avatar alternatives keep both encrypted files referenced', () => {
  const base = fixture(); const a = edit(base, 'A', d => { d.clients[0].avatarId = 'avatar-A'; }); const b = edit(base, 'B', d => { d.clients[0].avatarId = 'avatar-B'; });
  assert.deepEqual(referencedBlobs(mergeVaults(a, b)).sort(), ['avatar-A', 'avatar-B']);
});
test('erasure strips hidden clinical content and survives old devices indefinitely', () => {
  const base = fixture(); const a = edit(base, 'A', d => { d.clients = []; d.sessions = []; }); const b = edit(base, 'B', d => { d.sessions[0].notes = 'Concurrent private secret'; d.clients[0].avatarId = 'private-file'; }, Number.MAX_SAFE_INTEGER);
  const merged = mergeVaults(a, b); assert.equal(merged.clients.length, 0); assert.equal(merged.sessions.length, 0);
  assert.doesNotMatch(JSON.stringify(merged.crdt), /Private Client|private-file|Concurrent private secret|Shared starting note/);
  assert.equal(mergeVaults(merged, b).clients.length, 0); assert.deepEqual(referencedBlobs(merged), []);
});
test('legacy migration is deterministic and preserves divergent unstamped legacy changes', () => {
  const base = fixture(); delete base.crdt; assert.deepEqual(stateOf(base), stateOf(structuredClone(base)));
  base.crdt = stateOf(base); const olderApp = structuredClone(base); olderApp.clients[0].preparation = 'Edited by older app'; olderApp.clients[0].updatedAt = 100;
  const result = mergeVaults(base, olderApp); assert.equal(result.clients[0].preparation, 'Edited by older app');
});
test('a legacy app echoing CRDT metadata can delete a client without resurrection', () => {
  const base = fixture(), oldApp = structuredClone(base); oldApp.clients = []; oldApp.sessions = []; oldApp.deleted.client = 200; oldApp.deleted.session = 200;
  const merged = mergeVaults(base, oldApp); assert.equal(merged.clients.length, 0); assert.equal(merged.sessions.length, 0); assert.doesNotMatch(JSON.stringify(merged.crdt), /Private Client|Shared starting note/);
});
test('legacy writes reusing a timestamp still receive a new causal dot when a value is revisited', () => {
  let data = fixture();
  for (const text of ['first', 'second', 'first']) {
    const oldApp = structuredClone(data); oldApp.clients[0].preparation = text; oldApp.clients[0].updatedAt = 100;
    data = mergeVaults(data, oldApp); assert.equal(data.clients[0].preparation, text); assert.equal(syncConflicts(data).length, 0);
  }
});
test('deleting a session concurrently with an edit requires an explicit restore', () => {
  const base = fixture(); const gone = edit(base, 'A', d => { d.sessions = []; }); const changed = edit(base, 'B', d => { d.sessions[0].notes = 'Keep this note'; });
  const merged = mergeVaults(gone, changed); assert.equal(merged.sessions.length, 0);
  const conflict = syncConflicts(merged).find(c => c.collection === 'sessions' && c.field === '$exists')!;
  resolveConflict(merged, conflict, conflict.variants.find(v => v.value === true)!);
  assert.equal(materialize(merged, stateOf(merged)).sessions[0].notes, 'Keep this note');
});
