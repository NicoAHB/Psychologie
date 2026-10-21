import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { decryptVault, deriveKey, encryptVault, randomSalt, wrapWithPassphrase, randomKeyBytes, importDataKey } from '../src/lib/crypto';
import { getRevision, setRevision } from '../src/lib/db';
import { overrideCloud, remoteEnvelope, syncVault, cloudError } from '../src/lib/cloud';
import { fetchMerged } from '../src/lib/syncMerge';
import { stampChanges } from '../src/lib/merge';
import { emptyVault, uid, type Client, type RemoteVault, type VaultData } from '../src/lib/types';

const user = uid(); const vaultId = uid();
let remote: RemoteVault | null = null;
overrideCloud({
  auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remote, error: null }) }) }) }),
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === 'replace_reminder_jobs') return { data: null, error: null };
    if ((remote?.revision ?? 0) !== args.p_expected_revision) return { data: null, error: new Error('SYNC_CONFLICT') };
    remote = { vault_id: String(args.p_vault_id), salt: String(args.p_salt), payload: args.p_payload as RemoteVault['payload'], revision: (remote?.revision ?? 0) + 1 };
    return { data: remote.revision, error: null };
  },
  storage: { from: () => ({ list: async () => ({ data: [], error: null }), upload: async () => ({ error: null }), remove: async () => ({ error: null }), download: async () => ({ data: null, error: new Error('missing') }) }) },
});
const raw = randomKeyBytes(); const { salt, wrap } = await wrapWithPassphrase('two devices passphrase', raw, vaultId); const key = await importDataKey(raw);
const baseEnvelope = (data: VaultData) => encryptVault(key, data, vaultId, salt, { format: 'praxisraum-v2', wraps: { passphrase: wrap } });
const client = (name: string): Client => ({ id: uid(), name, contact: '', preparation: '', telegramChatId: '', language: 'de', reminderConsent: false, createdAt: '2026-01-01' });
const edit = (data: VaultData, change: (d: VaultData) => void, now: number) => { const next = structuredClone(data); change(next); stampChanges(data, next, now); return next; };

test('a second device that fell behind merges the cloud state instead of failing, and nothing is lost', async () => {
  const x = client('Gemeinsamer Klient'); let start = emptyVault(); start.clients.push(x); start = edit(start, () => {}, 1); start.clients[0].updatedAt = 1;
  // Device A saves the shared starting point.
  await syncVault(await baseEnvelope(start), start); assert.equal(await getRevision(user, vaultId), 1);
  // Device B edits offline while device A continues.
  const deviceB = edit(start, d => { d.sessions.push({ id: uid(), clientId: x.id, date: '2026-05-01', time: '10:00', feeCents: 9000, paidAt: null, notes: 'Notiz von Gerät B', tags: [] }); }, 20);
  const y = client('Neuer Klient von Gerät A'); const deviceA = edit(start, d => { d.clients.push(y); d.clients[0].preparation = 'Vorbereitung von Gerät A'; }, 30);
  await syncVault(await baseEnvelope(deviceA), deviceA); assert.equal(await getRevision(user, vaultId), 2);
  await setRevision(user, vaultId, 1); // what device B still believes
  await assert.rejects(async () => syncVault(await baseEnvelope(deviceB), deviceB), (err: unknown) => cloudError(err) === 'syncConflict');
  const merged = await fetchMerged(key, deviceB, await baseEnvelope(deviceB));
  assert.deepEqual(merged.data.clients.map(c => c.name).sort(), ['Gemeinsamer Klient', 'Neuer Klient von Gerät A']);
  assert.equal(merged.data.clients.find(c => c.id === x.id)!.preparation, 'Vorbereitung von Gerät A'); assert.equal(merged.data.sessions[0].notes, 'Notiz von Gerät B');
  assert.equal(merged.revision, 2);
  await setRevision(merged.userId, merged.vaultId, merged.revision);
  await syncVault(await baseEnvelope(merged.data), merged.data); assert.equal(await getRevision(user, vaultId), 3);
  const stored = await decryptVault(key, remoteEnvelope(remote!)); assert.equal(stored.clients.length, 2); assert.equal(stored.sessions.length, 1);
});
test('a vault of another key or another identity is never merged', async () => {
  const stranger = await deriveKey('someone else entirely', randomSalt());
  const ours = await baseEnvelope(emptyVault());
  await assert.rejects(() => fetchMerged(stranger, emptyVault(), ours)); // the cloud copy cannot be opened with a different data key
  await assert.rejects(() => fetchMerged(key, emptyVault(), { ...ours, vaultId: uid() }), /differentVault/);
});
