import type { EncryptedBlob, VaultEnvelope } from './types';
let pending: Promise<IDBDatabase> | undefined;
export function database(): Promise<IDBDatabase> {
  return pending ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('praxisraum', 1);
    request.onupgradeneeded = () => {
      for (const name of ['vault', 'blobs', 'meta']) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { pending = undefined; reject(request.error); };
    request.onblocked = () => { pending = undefined; reject(new Error('storageError')); };
  });
}
async function operation<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('storageError'));
  });
}
export const readVault = () => operation<VaultEnvelope | undefined>('vault', 'readonly', s => s.get('primary'));
export const writeVault = (value: VaultEnvelope) => operation('vault', 'readwrite', s => s.put(value, 'primary'));
export const readBlob = (id: string) => operation<EncryptedBlob | undefined>('blobs', 'readonly', s => s.get(id));
export const writeBlob = (blob: EncryptedBlob) => operation('blobs', 'readwrite', s => s.put(blob, blob.id));
export const allBlobs = () => operation<EncryptedBlob[]>('blobs', 'readonly', s => s.getAll());
export const getRevision = async (user: string, vault: string) => (await operation<number | undefined>('meta', 'readonly', s => s.get(`revision:${user}:${vault}`))) ?? 0;
export const setRevision = (user: string, vault: string, revision: number) => operation('meta', 'readwrite', s => s.put(revision, `revision:${user}:${vault}`));
export const deleteBlob = (id: string) => operation('blobs', 'readwrite', s => s.delete(id));
// Images deleted on this device whose encrypted copy must still be removed from the cloud on the next sync.
const removalKey = (vault: string) => `removals:${vault}`;
export const getRemovals = async (vault: string) => new Set((await operation<string[] | undefined>('meta', 'readonly', s => s.get(removalKey(vault)))) ?? []);
export const setRemovals = (vault: string, ids: Set<string>) => operation('meta', 'readwrite', s => s.put([...ids], removalKey(vault)));
/** Erase images locally; the cloud copy follows on the next sync. The removal is recorded first so a crash cannot strand a remote copy. */
export async function purgeBlobs(vault: string, ids: string[]) {
  await setRemovals(vault, new Set([...await getRemovals(vault), ...ids]));
  for (const id of ids) await deleteBlob(id);
}
