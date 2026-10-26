import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { UpdateGuard } from '../src/lib/updateGuard';
import { metaGet, metaPut } from '../src/lib/db';
import { emailFingerprint, markBackupProof, markEmailProof, readBackupProof, readEmailProof } from '../src/lib/setupProof';
import type { EmailStatus } from '../src/lib/emailSettings';
import { appBuild } from '../src/lib/buildInfo';
test('a rejected or synchronously failed save never activates an update; a deliberate retry can succeed', async () => {
  const gate = new UpdateGuard(); let applied = 0;
  await assert.rejects(() => gate.run(async () => { throw new Error('disk full'); }, () => applied++)); assert.equal(applied, 0);
  await assert.rejects(() => gate.run(() => { throw new Error('draft failure'); }, () => applied++)); assert.equal(applied, 0);
  await gate.run(async () => {}, () => applied++); assert.equal(applied, 1);
  assert.equal(await gate.run(async () => {}, () => applied++), false); assert.equal(applied, 1);
});
test('double activation waits for the first durable write and never posts a second update', async () => {
  const gate = new UpdateGuard(); let release!: () => void, calls = 0;
  const pending = gate.run(() => new Promise<void>(resolve => { release = resolve; }), () => calls++);
  assert.equal(await gate.run(async () => {}, () => calls++), false); assert.equal(calls, 0);
  release(); await pending; assert.equal(calls, 1);
});
test('backup checks and manual recovery confirmations remain separate, concurrent and scoped to their vault', async () => {
  assert.deepEqual(await readBackupProof('one'), {});
  await Promise.all([markBackupProof('one', 'check', 1000), markBackupProof('one', 'recovery', 2000)]);
  assert.deepEqual(await readBackupProof('one'), { checkedAt: 1000, recoveryConfirmedAt: 2000 }); assert.deepEqual(await readBackupProof('other'), {});
  await metaPut('backup-check:bad', 'not-a-date'); assert.deepEqual(await readBackupProof('bad'), {});
  await assert.rejects(() => markBackupProof('one', 'check', NaN));
});
test('email receipt confirmation survives reloads but never applies to another account or changed configuration', async () => {
  const status: EmailStatus = { provider: 'gmail', endpoint: 'https://script.google.com/macros/s/synthetic/exec', senderEmail: 'owner@gmail.com', senderName: 'Praxis', enabled: true, ready: true, editable: true, keyStored: true, accountEmail: 'account@example.com', source: 'saved', updatedAt: '2026-10-26T08:00:00Z' };
  const fp = await emailFingerprint('owner', status); assert.equal(await readEmailProof('owner', fp), undefined);
  await markEmailProof('owner', fp, 3000); assert.equal((await readEmailProof('owner', fp))?.confirmedAt, undefined);
  await markEmailProof('owner', fp, 3000, 4000); assert.equal((await readEmailProof('owner', fp))?.confirmedAt, 4000);
  for (const next of [{ ...status, updatedAt: '2026-10-27T08:00:00Z' }, { ...status, senderEmail: 'other@gmail.com' }, { ...status, provider: 'resend' as const }, { ...status, endpoint: 'changed' }]) assert.equal(await readEmailProof('owner', await emailFingerprint('owner', next)), undefined);
  assert.equal(await readEmailProof('other', fp), undefined); assert.notEqual(await emailFingerprint('other', status), fp);
  const stored = JSON.stringify(await metaGet('email-proof:owner')); assert.ok(!stored.includes(status.senderEmail)); assert.ok(!stored.includes(status.endpoint));
  await markEmailProof('owner', fp, 3000); assert.equal((await readEmailProof('owner', fp))?.confirmedAt, undefined);
});
test('development builds expose a recognizable version without implying a published release', () => {
  assert.match(appBuild.version, /^\d+\.\d+\.\d+$/); assert.equal(appBuild.modified, true); assert.equal(appBuild.revision, '');
});
