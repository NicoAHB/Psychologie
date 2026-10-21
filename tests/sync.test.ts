import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { deriveKey, encryptBytes, encryptVault, randomSalt } from '../src/lib/crypto';
import { getRemovals, getRevision, purgeBlobs, readBlob, writeBlob } from '../src/lib/db';
import { overrideCloud, syncVault } from '../src/lib/cloud';
import { emptyVault, uid, type EncryptedBlob, type VaultData } from '../src/lib/types';

const user = uid(); const vaultId = uid(); const salt = randomSalt();
const key = await deriveKey('a long and unique test passphrase', salt);
const files = new Map<string, string>(); const log: string[] = [];
let remote: { vault_id: string; salt: string; payload: unknown; revision: number } | null = null;
overrideCloud({
  auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remote, error: null }) }) }) }),
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === 'replace_reminder_jobs') return { data: null, error: null };
    if ((remote?.revision ?? 0) !== args.p_expected_revision) return { data: null, error: new Error('SYNC_CONFLICT') };
    remote = { vault_id: String(args.p_vault_id), salt: String(args.p_salt), payload: args.p_payload, revision: (remote?.revision ?? 0) + 1 };
    return { data: remote.revision, error: null };
  },
  storage: { from: () => ({
    list: async (folder: string, { limit, offset }: { limit: number; offset: number }) => ({ data: [...files.keys()].filter(p => p.startsWith(`${folder}/`)).map(p => ({ name: p.slice(folder.length + 1) })).slice(offset, offset + limit), error: null }),
    upload: async (path: string, blob: Blob) => { log.push(`upload ${path.split('/').pop()}`); files.set(path, await blob.text()); return { error: null }; },
    remove: async (paths: string[]) => { for (const path of paths) { log.push(`remove ${path.split('/').pop()}`); files.delete(path); } return { error: null }; },
    download: async (path: string) => files.has(path) ? { data: new Blob([files.get(path)!]), error: null } : { data: null, error: new Error('missing') },
  }) },
});
async function image(): Promise<string> {
  const id = uid(); const blob: EncryptedBlob = { id, vaultId, payload: await encryptBytes(key, new Uint8Array([1, 2, 3]), `praxisraum-blob:v1:${vaultId}:${id}`) };
  await writeBlob(blob); return id;
}
function vaultWith(blobIds: string[]): VaultData {
  const data = emptyVault(); const client = uid();
  data.clients.push({ id: client, name: 'X', contact: '', preparation: '', telegramChatId: '', language: 'de', reminderConsent: false, createdAt: '2026-01-01', avatarId: blobIds[0] });
  for (const blobId of blobIds.slice(1)) data.notes.push({ id: uid(), clientId: client, blobId, createdAt: '2026-01-02T10:00:00Z', tags: [], caption: '' });
  return data;
}
const sync = async (data: VaultData) => syncVault(await encryptVault(key, data, vaultId, salt), data);

test('every encrypted image is uploaded once, not on every later sync', async () => {
  const ids = [await image(), await image(), await image()]; const data = vaultWith(ids);
  await sync(data); assert.deepEqual(log.splice(0).sort(), ids.map(id => `upload ${id}.json`).sort());
  await sync(data); assert.deepEqual(log.splice(0), []);
  assert.equal(await getRevision(user, vaultId), 2);
});
test('a new image is the only upload; an image lost in the cloud is healed on the next sync', async () => {
  const [avatar, ...others] = [...files.keys()].map(path => path.split('/').pop()!.replace('.json', ''));
  const fresh = await image(); const data = vaultWith([avatar, ...others, fresh]);
  await sync(data); assert.deepEqual(log.splice(0), [`upload ${fresh}.json`]);
  files.delete(`${user}/${vaultId}/${others[0]}.json`);
  await sync(data); assert.deepEqual(log.splice(0), [`upload ${others[0]}.json`]);
});
test('deleted images are removed from device and cloud only after the new vault state is saved', async () => {
  const keep = [...files.keys()].map(path => path.split('/').pop()!.replace('.json', '')); const [gone, ...rest] = keep.slice().reverse();
  await purgeBlobs(vaultId, [gone]);
  assert.equal(await readBlob(gone), undefined); assert.deepEqual([...await getRemovals(vaultId)], [gone]);
  assert.ok(files.has(`${user}/${vaultId}/${gone}.json`), 'cloud copy survives until a sync saved the vault without it');
  await sync(vaultWith(rest)); assert.deepEqual(log.splice(0), [`remove ${gone}.json`]);
  assert.equal(files.has(`${user}/${vaultId}/${gone}.json`), false); assert.equal((await getRemovals(vaultId)).size, 0);
});
test('a vault changed on another device is never overwritten', async () => {
  remote = { ...remote!, revision: remote!.revision + 1 };
  await assert.rejects(() => sync(vaultWith([])), /SYNC_CONFLICT/);
  assert.deepEqual(log.splice(0), []);
});
