import { useCallback, useEffect, useRef, useState } from 'react';
import { allBlobs, readBlob, readVault, writeBlob, writeVault } from './db';
import { decryptBytes, decryptVault, deriveKey, encryptBytes, encryptVault, randomSalt, validateEnvelope } from './crypto';
import { emptyVault, uid, type EncryptedBlob, type VaultData, type VaultEnvelope } from './types';
import { demoVault } from './demo';
import { downloadBlob, referencedBlobs } from './cloud';
export function useVault() {
  const [envelope, setEnvelope] = useState<VaultEnvelope | null | undefined>(undefined);
  const [data, setData] = useState<VaultData | null>(null);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [demo, setDemo] = useState(false);
  const [generation, setGeneration] = useState(0);
  const key = useRef<CryptoKey | null>(null);
  const current = useRef<VaultData | null>(null);
  const info = useRef<VaultEnvelope | null>(null);
  const demoRef = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const failure = useRef(false);
  const memoryBlobs = useRef(new Map<string, EncryptedBlob>());
  useEffect(() => { readVault().then(v => { setEnvelope(v ?? null); info.current = v ?? null; }).catch(() => setLoadError(true)); }, []);
  const persist = useCallback((value: VaultData) => {
    const activeKey = key.current!;
    const metadata = info.current!;
    const isDemo = demoRef.current;
    setSaving(true);
    const task = queue.current.catch(() => {}).then(async () => {
      if (isDemo) return;
      const encrypted = await encryptVault(activeKey, value, metadata.vaultId, metadata.salt);
      await writeVault(encrypted);
      info.current = encrypted;
      setEnvelope(encrypted);
    });
    queue.current = task;
    task.then(() => { if (queue.current === task) { failure.current = false; setSaving(false); setStorageError(false); } }, () => { failure.current = true; setStorageError(true); setSaving(false); });
    return task;
  }, []);
  const update = useCallback((change: (value: VaultData) => void): Promise<void> => {
    if (!current.current || !key.current) return Promise.reject(new Error('locked'));
    const next = structuredClone(current.current);
    change(next);
    current.current = next;
    setData(next);
    setGeneration(g => g + 1);
    return persist(next);
  }, [persist]);
  const flush = useCallback(async () => { await queue.current; if (failure.current) throw new Error('storageError'); }, []);
  const create = async (passphrase: string) => {
    const salt = randomSalt();
    const newKey = await deriveKey(passphrase, salt);
    const value = emptyVault();
    const encrypted = await encryptVault(newKey, value, uid(), salt);
    await writeVault(encrypted);
    key.current = newKey; current.current = value; info.current = encrypted;
    demoRef.current = false; setDemo(false); setEnvelope(encrypted); setData(value);
    void navigator.storage?.persist?.();
  };
  const unlock = async (passphrase: string) => {
    if (!info.current) return;
    const newKey = await deriveKey(passphrase, info.current.salt);
    const value = await decryptVault(newKey, info.current);
    key.current = newKey; current.current = value; setData(value); setGeneration(0);
  };
  const openDemo = async () => {
    key.current = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    demoRef.current = true; setDemo(true); memoryBlobs.current.clear();
    current.current = demoVault(); setData(current.current); setGeneration(0);
  };
  const lock = useCallback(async () => {
    await flush();
    key.current = null; current.current = null; setData(null); setGeneration(0);
    memoryBlobs.current.clear(); demoRef.current = false; setDemo(false);
    const stored = await readVault(); info.current = stored ?? null; setEnvelope(stored ?? null);
  }, [flush]);
  const addImage = async (bytes: Uint8Array<ArrayBuffer>) => {
    if (!key.current) throw new Error('locked');
    const id = uid();
    const vaultId = demoRef.current ? 'demo' : info.current!.vaultId;
    const blob: EncryptedBlob = { id, vaultId, payload: await encryptBytes(key.current, bytes, `praxisraum-blob:v1:${vaultId}:${id}`) };
    if (demoRef.current) memoryBlobs.current.set(id, blob); else await writeBlob(blob);
    return id;
  };
  const image = useCallback(async (id: string) => {
    if (!key.current) throw new Error('locked');
    const activeKey = key.current;
    const vaultId = demoRef.current ? 'demo' : info.current!.vaultId;
    const blob = demoRef.current ? memoryBlobs.current.get(id) : (await readBlob(id)) ?? (await downloadBlob(vaultId, id));
    if (!blob || blob.vaultId !== vaultId) throw new Error('storageError');
    return new Blob([await decryptBytes(activeKey, blob.payload, `praxisraum-blob:v1:${vaultId}:${id}`)], { type: 'image/webp' });
  }, []);
  const exportBackup = async () => {
    await flush();
    if (demoRef.current || !info.current || !current.current) return;
    const ids = referencedBlobs(current.current);
    for (const id of ids) if (!await readBlob(id)) await downloadBlob(info.current.vaultId, id);
    const blobs = (await allBlobs()).filter(b => b.vaultId === info.current!.vaultId && ids.includes(b.id));
    return { type: 'praxisraum-backup-v1', envelope: info.current, blobs };
  };
  const importBackup = async (value: unknown) => {
    const backup = value as { type: string; envelope: VaultEnvelope; blobs: EncryptedBlob[] };
    if (backup.type !== 'praxisraum-backup-v1' || !Array.isArray(backup.blobs)) throw new Error('invalidBackup');
    validateEnvelope(backup.envelope);
    if (backup.blobs.some(b => b.vaultId !== backup.envelope.vaultId || typeof b.id !== 'string' || !b.payload?.iv || !b.payload?.ciphertext)) throw new Error('invalidBackup');
    await flush();
    for (const blob of backup.blobs) await writeBlob(blob);
    await writeVault(backup.envelope);
    await lock();
  };
  const retry = () => current.current ? persist(current.current) : Promise.resolve();
  return { envelope, data, saving, storageError, loadError, demo, generation, create, unlock, openDemo, update, flush, lock, addImage, image, exportBackup, importBackup, retry };
}
export type VaultController = ReturnType<typeof useVault>;
