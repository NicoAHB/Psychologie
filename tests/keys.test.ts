import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { decryptVault, deriveBits, deriveKey, encryptVault, importDataKey, passphraseSalt, randomKeyBytes, randomSalt, secretKek, unwrapDataKey, validateEnvelope, wrapDataKey, wrapWithPassphrase } from '../src/lib/crypto';
import { formatRecoveryKey, newRecoveryBytes, parseRecoveryKey } from '../src/lib/recovery';
import { listSnapshots, readSnapshot, recordSnapshot, SNAPSHOT_LIMIT, SNAPSHOT_WINDOW_MS } from '../src/lib/history';
import { emptyVault, uid } from '../src/lib/types';

test('recovery keys round-trip, tolerate formatting and letter confusion, and catch typos', async () => {
  const bytes = newRecoveryBytes(); const text = await formatRecoveryKey(bytes);
  assert.match(text, /^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/);
  assert.deepEqual(await parseRecoveryKey(text), bytes);
  assert.deepEqual(await parseRecoveryKey(text.toLowerCase().replaceAll('-', ' ')), bytes);
  const typo = text.replace(/[1-9A-Z]/, c => c === 'A' ? 'B' : 'A');
  await assert.rejects(() => parseRecoveryKey(typo), /invalidRecoveryKey/); await assert.rejects(() => parseRecoveryKey(text.slice(0, -5)), /invalidRecoveryKey/);
  await assert.rejects(() => parseRecoveryKey('hello'), /invalidRecoveryKey/);
});
test('one random data key opens through passphrase and recovery key; wrong secrets and swapped contexts fail', async () => {
  const raw = randomKeyBytes(); const vaultId = uid();
  const { wrap, salt } = await wrapWithPassphrase('correct horse battery staple', raw, vaultId);
  const recovery = newRecoveryBytes(); const recoveryWrap = await wrapDataKey(await secretKek(recovery, 'recovery'), raw, vaultId, 'recovery');
  const viaPassphrase = await unwrapDataKey(await deriveKey('correct horse battery staple', salt), wrap, vaultId, 'passphrase');
  const viaRecovery = await unwrapDataKey(await secretKek(recovery, 'recovery'), recoveryWrap, vaultId, 'recovery');
  assert.deepEqual(viaPassphrase, raw); assert.deepEqual(viaRecovery, raw);
  const [wrongPassphrase, recoveryKek, otherKek, passkeyKek] = await Promise.all([deriveKey('wrong passphrase!!', salt), secretKek(recovery, 'recovery'), secretKek(newRecoveryBytes(), 'recovery'), secretKek(recovery, 'passkey')]);
  await assert.rejects(() => unwrapDataKey(wrongPassphrase, wrap, vaultId, 'passphrase'));
  await assert.rejects(() => unwrapDataKey(recoveryKek, recoveryWrap, uid(), 'recovery'));
  await assert.rejects(() => unwrapDataKey(otherKek, recoveryWrap, vaultId, 'recovery'));
  await assert.rejects(() => unwrapDataKey(passkeyKek, recoveryWrap, vaultId, 'recovery'));
});
test('a v2 envelope decrypts with the unwrapped key and keeps its passphrase salt inside the wrap', async () => {
  const raw = randomKeyBytes(); const vaultId = uid(); const { wrap, salt } = await wrapWithPassphrase('a long and unique test passphrase', raw, vaultId);
  const key = await importDataKey(raw); const data = emptyVault(); data.settings.practice.name = 'Praxis Test';
  const envelope = await encryptVault(key, data, vaultId, salt, { format: 'praxisraum-v2', wraps: { passphrase: wrap } });
  validateEnvelope(envelope); assert.equal(passphraseSalt(envelope), salt);
  assert.equal((await decryptVault(await importDataKey(await unwrapDataKey(await deriveKey('a long and unique test passphrase', passphraseSalt(envelope)), envelope.wraps!.passphrase, vaultId, 'passphrase')), envelope)).settings.practice.name, 'Praxis Test');
  assert.throws(() => validateEnvelope({ ...envelope, wraps: undefined }));
});
test('a v1 vault is upgraded without touching its data key: PBKDF2 bits equal the old derived key', async () => {
  const salt = randomSalt(); const oldKey = await deriveKey('legacy passphrase 123', salt); const vaultId = uid();
  const legacy = await encryptVault(oldKey, emptyVault(), vaultId, salt); assert.equal(legacy.format, 'praxisraum-v1');
  const raw = await deriveBits('legacy passphrase 123', salt);
  assert.equal((await decryptVault(await importDataKey(raw), legacy)).schema, 1);
});
test('vault history keeps one snapshot per window, always snapshots before deletions and prunes the oldest', async () => {
  const salt = randomSalt(); const key = await deriveKey('history test passphrase', salt); const vaultId = uid();
  const envelope = await encryptVault(key, emptyVault(), vaultId, salt); const t0 = 1_000_000;
  await recordSnapshot(envelope, false, t0); await recordSnapshot(envelope, false, t0 + 1000);
  assert.equal((await listSnapshots(vaultId)).length, 1);
  await recordSnapshot(envelope, false, t0 + SNAPSHOT_WINDOW_MS + 1); await recordSnapshot(envelope, true, t0 + SNAPSHOT_WINDOW_MS + 2);
  assert.deepEqual((await listSnapshots(vaultId)).map(e => e.reason), ['delete', 'auto', 'auto']);
  assert.deepEqual(await readSnapshot(vaultId, t0), envelope);
  for (let i = 0; i < SNAPSHOT_LIMIT + 5; i++) await recordSnapshot(envelope, true, t0 + 10 * SNAPSHOT_WINDOW_MS + i);
  const kept = await listSnapshots(vaultId); assert.equal(kept.length, SNAPSHOT_LIMIT); assert.equal(await readSnapshot(vaultId, t0), undefined);
});
import { backupNeeded, latestChange } from '../src/lib/backupState';
test('the backup reminder appears when nothing was ever saved elsewhere, or when the last copy is old and data changed since', () => {
  const day = 864e5; const now = 100 * day;
  assert.deepEqual(backupNeeded(undefined, 0, false, now), { needed: false, days: 0 });
  assert.equal(backupNeeded(undefined, 5, true, now).needed, true);
  assert.equal(backupNeeded({ at: now - 2 * day, kind: 'auto' }, now - day, true, now).needed, false);
  assert.deepEqual(backupNeeded({ at: now - 9 * day, kind: 'download' }, now - 8 * day, true, now), { needed: true, days: 9 });
  assert.equal(backupNeeded({ at: now - 9 * day, kind: 'download' }, now - 20 * day, true, now).needed, false, 'old copy but nothing changed since');
  assert.equal(latestChange({ clients: [{ updatedAt: 5 }], appointments: [], sessions: [{ updatedAt: 9 }], notes: [], invoices: [{}] }), 9);
});
