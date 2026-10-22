import { useCallback, useEffect, useRef, useState } from 'react';
import { allBlobs, purgeBlobs, readBlob, readVault, setRevision, writeBlob, writeVault } from './db';
import {
  deriveBits, deriveKey, importDataKey, passphraseSalt, randomKeyBytes, secretKek,
  unwrapDataKey, validateEnvelope, wrapDataKey, wrapWithPassphrase,
} from './crypto';
import { decryptBytes, decryptVault, encryptBytes, encryptVault, runSecureTask, stopSecureWorker } from './workerTasks';
import { emptyVault, uid, type EncryptedBlob, type PasskeyWrap, type VaultData, type VaultEnvelope, type Wraps } from './types';
import { demoVault } from './demo';
import { downloadBlob } from './cloud';
import { fetchMerged } from './syncMerge';
import { referencedBlobs } from './blobs';
import { orphanedBlobs } from './records';
import { stampChanges } from './merge';
import { formatRecoveryKey, newRecoveryBytes, parseRecoveryKey } from './recovery';
import { createPasskey, unlockWithPasskey as assertPasskey } from './passkey';
import { clearSnapshots, commitVaultSnapshot, historyBlobIds, listSnapshots, readSnapshot, recordSnapshot } from './history';

export function useVault() {
  const [envelope, setEnvelope] = useState<VaultEnvelope | null | undefined>(undefined);
  const [data, setData] = useState<VaultData | null>(null);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [demo, setDemo] = useState(false);
  const [generation, setGeneration] = useState(0);
  /** True after unlocking with the recovery key: the passphrase is unknown and must be replaced. */
  const [passphraseReset, setPassphraseReset] = useState(false);
  const key = useRef<CryptoKey | null>(null);
  const recoveredKey = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const current = useRef<VaultData | null>(null);
  const persisted = useRef<VaultData | null>(null);
  const info = useRef<VaultEnvelope | null>(null);
  const demoRef = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const failure = useRef(false);
  const lastStamp = useRef(0);
  const actor = useRef(crypto.randomUUID());
  const generationRef = useRef(0);
  const bump = () => { generationRef.current += 1; setGeneration(generationRef.current); };
  const memoryBlobs = useRef(new Map<string, EncryptedBlob>());
  useEffect(() => { readVault().then(v => { setEnvelope(v ?? null); info.current = v ?? null; }).catch(() => setLoadError(true)); }, []);

  /** Everything that writes to storage goes through one queue so envelope changes and data saves never interleave. */
  const enqueue = useCallback((work: () => Promise<void>) => {
    setSaving(true);
    const task = queue.current.catch(() => {}).then(work);
    queue.current = task;
    task.then(() => { if (queue.current === task) { failure.current = false; setSaving(false); setStorageError(false); } }, () => { failure.current = true; setStorageError(true); setSaving(false); });
    return task;
  }, []);
  const persist = useCallback((value: VaultData, wraps?: Partial<VaultEnvelope>) => {
    const activeKey = key.current!; const isDemo = demoRef.current;
    return enqueue(async () => {
      if (isDemo) return;
      const base = info.current!;
      const encrypted = await encryptVault(activeKey, value, base.vaultId, base.salt, { format: base.format, wraps: base.wraps, ...wraps });
      const discarded = await commitVaultSnapshot(encrypted, referencedBlobs(value));
      info.current = encrypted; persisted.current = value; setEnvelope(encrypted);
      if (discarded.length) await purgeBlobs(base.vaultId, discarded).catch(() => {});
    });
  }, [enqueue]);
  /** Change only the key wraps (recovery key, passkeys, passphrase); the encrypted data stays as it is. */
  const changeEnvelope = useCallback((change: (envelope: VaultEnvelope) => Partial<VaultEnvelope>) => enqueue(async () => {
    if (demoRef.current) throw new Error('demo');
    const next = { ...info.current!, ...change(info.current!) };
    await writeVault(next); info.current = next; setEnvelope(next); bump();
  }), [enqueue]);

  const update = useCallback((change: (value: VaultData) => void): Promise<void> => {
    if (!current.current || !key.current) return Promise.reject(new Error('locked'));
    const next = structuredClone(current.current);
    change(next);
    lastStamp.current = Math.max(Date.now(), lastStamp.current + 1);
    stampChanges(current.current, next, lastStamp.current, actor.current);
    current.current = next;
    setData(next);
    bump();
    return persist(next);
  }, [persist]);
  const flush = useCallback(async () => {
    // Visibility/pagehide handlers can enqueue a final note while an earlier save settles.
    for (;;) { const task = queue.current; await task; if (queue.current === task) break; }
    if (failure.current) throw new Error('storageError');
  }, []);
  /** An envelope and its exact plaintext/blob references must travel together, even if React
   * has not rendered the latest update yet. Never derive this pair from separate async reads. */
  const snapshotForSync = async () => {
    for (;;) {
      await flush();
      if (!current.current || !key.current || !info.current || demoRef.current) throw new Error('locked');
      if (persisted.current !== current.current) continue;
      return { data: current.current, envelope: info.current, generation: generationRef.current };
    }
  };

  const open = async (dataKey: CryptoKey, envelopeValue: VaultEnvelope) => {
    const { value, migrated } = await runSecureTask('openVault', { key: dataKey, envelope: envelopeValue });
    key.current = dataKey; current.current = value; persisted.current = migrated ? null : value; setData(value); generationRef.current = 0; setGeneration(0);
    if (migrated) { await persist(value); bump(); }
  };
  const create = async (passphrase: string) => {
    const raw = randomKeyBytes(); const vaultId = uid();
    const { salt, wrap } = await wrapWithPassphrase(passphrase, raw, vaultId);
    const dataKey = await importDataKey(raw); raw.fill(0);
    const value = emptyVault();
    const encrypted = await encryptVault(dataKey, value, vaultId, salt, { format: 'praxisraum-v2', wraps: { passphrase: wrap } });
    await writeVault(encrypted);
    key.current = dataKey; current.current = value; persisted.current = value; info.current = encrypted;
    demoRef.current = false; setDemo(false); setEnvelope(encrypted); setData(value);
    void navigator.storage?.persist?.();
  };
  /** The raw data key for this envelope, from the passphrase; throws when the passphrase is wrong. */
  const rawFromPassphrase = async (passphrase: string, envelopeValue: VaultEnvelope) => {
    if (envelopeValue.format === 'praxisraum-v2') return unwrapDataKey(await deriveKey(passphrase, passphraseSalt(envelopeValue)), envelopeValue.wraps!.passphrase, envelopeValue.vaultId, 'passphrase');
    const raw = await deriveBits(passphrase, envelopeValue.salt);
    await decryptVault(await importDataKey(raw), envelopeValue); // v1 has no wrap to fail, so prove the passphrase on the data
    return raw;
  };
  const unlock = async (passphrase: string) => {
    if (!info.current) return;
    const raw = await rawFromPassphrase(passphrase, info.current);
    const dataKey = await importDataKey(raw); raw.fill(0);
    await open(dataKey, info.current);
  };
  const unlockWithRecovery = async (text: string) => {
    const env = info.current;
    if (!env?.wraps?.recovery) throw new Error('noRecoveryKey');
    const bytes = await parseRecoveryKey(text);
    const raw = await unwrapDataKey(await secretKek(bytes, 'recovery'), env.wraps.recovery, env.vaultId, 'recovery');
    await open(await importDataKey(raw), env);
    recoveredKey.current = raw; setPassphraseReset(true);
  };
  const unlockWithPasskey = async () => {
    const env = info.current; const passkeys = env?.wraps?.passkeys ?? [];
    if (!env || !passkeys.length) throw new Error('noPasskey');
    const { credentialId, secret } = await assertPasskey(passkeys);
    const wrap = passkeys.find(p => p.credentialId === credentialId)!;
    const raw = await unwrapDataKey(await secretKek(secret, 'passkey'), wrap, env.vaultId, `passkey:${credentialId}`);
    const dataKey = await importDataKey(raw); raw.fill(0);
    await open(dataKey, env);
  };
  const openDemo = async () => {
    key.current = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    demoRef.current = true; setDemo(true); memoryBlobs.current.clear();
    current.current = demoVault(); setData(current.current); generationRef.current = 0; setGeneration(0);
  };
  const lock = useCallback(async () => {
    await flush();
    recoveredKey.current?.fill(0); recoveredKey.current = null; setPassphraseReset(false);
    stopSecureWorker();
    key.current = null; current.current = null; persisted.current = null; setData(null); generationRef.current = 0; setGeneration(0);
    memoryBlobs.current.clear(); demoRef.current = false; setDemo(false);
    const stored = await readVault(); info.current = stored ?? null; setEnvelope(stored ?? null);
  }, [flush]);

  // ---- unlock methods and the passphrase (format v2) ----
  /** Make sure the envelope is v2 (wrapped data key) and return the raw data key; needs the current passphrase. */
  const rawKey = async (passphrase: string) => {
    const env = info.current!; if (demoRef.current || !current.current) throw new Error('demo');
    const raw = await rawFromPassphrase(passphrase, env);
    if (env.format === 'praxisraum-v2') return raw;
    const { salt, wrap } = await wrapWithPassphrase(passphrase, raw, env.vaultId); // upgrade: same key, now wrappable
    await persist(current.current, { format: 'praxisraum-v2', salt, wraps: { passphrase: wrap } });
    return raw;
  };
  const createRecoveryKey = async (passphrase: string) => {
    const raw = await rawKey(passphrase); const bytes = newRecoveryBytes();
    const wrap = await wrapDataKey(await secretKek(bytes, 'recovery'), raw, info.current!.vaultId, 'recovery'); raw.fill(0);
    await changeEnvelope(env => ({ wraps: { ...env.wraps!, recovery: wrap } }));
    return formatRecoveryKey(bytes);
  };
  const addPasskey = async (passphrase: string, label: string) => {
    const raw = await rawKey(passphrase); const credential = await createPasskey();
    const wrap = await wrapDataKey(await secretKek(credential.secret, 'passkey'), raw, info.current!.vaultId, `passkey:${credential.credentialId}`); raw.fill(0);
    const entry: PasskeyWrap = { ...wrap, credentialId: credential.credentialId, prfSalt: credential.prfSalt, label: label.trim().slice(0, 60) || 'Passkey' };
    await changeEnvelope(env => ({ wraps: { ...env.wraps!, passkeys: [...(env.wraps!.passkeys ?? []).filter(p => p.credentialId !== entry.credentialId), entry] } }));
  };
  const removePasskey = (credentialId: string) => changeEnvelope(env => ({ wraps: { ...env.wraps!, passkeys: (env.wraps!.passkeys ?? []).filter(p => p.credentialId !== credentialId), removedPasskeys: [...new Set([...env.wraps!.removedPasskeys ?? [], credentialId])] } as Wraps }));
  /** Replace the passphrase. After a recovery-key unlock `current` is not needed because the data key is still in memory. */
  const changePassphrase = async (next: string, current_?: string) => {
    const env = info.current!;
    const raw = recoveredKey.current ? recoveredKey.current.slice() : await rawKey(current_ ?? '');
    const { salt, wrap } = await wrapWithPassphrase(next, raw, env.vaultId); raw.fill(0);
    await changeEnvelope(e => ({ format: 'praxisraum-v2', salt, wraps: { ...e.wraps!, passphrase: wrap } }));
    recoveredKey.current?.fill(0); recoveredKey.current = null; setPassphraseReset(false);
  };

  // ---- images ----
  const addImage = async (bytes: Uint8Array<ArrayBuffer>) => {
    if (!key.current) throw new Error('locked');
    const id = uid(); const activeKey = key.current;
    const vaultId = demoRef.current ? 'demo' : info.current!.vaultId;
    const blob: EncryptedBlob = { id, vaultId, payload: await encryptBytes(key.current, bytes, `praxisraum-blob:v1:${vaultId}:${id}`) };
    if (key.current !== activeKey) throw new Error('locked');
    if (demoRef.current) memoryBlobs.current.set(id, blob); else await writeBlob(blob);
    return id;
  };
  const image = useCallback(async (id: string, mimeType = 'image/webp') => {
    if (!key.current) throw new Error('locked');
    const activeKey = key.current;
    const vaultId = demoRef.current ? 'demo' : info.current!.vaultId;
    const blob = demoRef.current ? memoryBlobs.current.get(id) : (await readBlob(id)) ?? (await downloadBlob(vaultId, id));
    if (!blob || blob.vaultId !== vaultId) throw new Error('storageError');
    if (key.current !== activeKey) throw new Error('locked');
    return new Blob([await decryptBytes(activeKey, blob.payload, `praxisraum-blob:v1:${vaultId}:${id}`)], { type: mimeType });
  }, []);
  // Images nobody references any more are erased locally and queued for removal from the cloud. Callers run this only
  // after the vault write that dropped the references succeeded, so a failed save can never cost an image.
  const purge = async (ids: string[]) => {
    if (!ids.length) return;
    if (demoRef.current) { ids.forEach(id => memoryBlobs.current.delete(id)); return; }
    await purgeBlobs(info.current!.vaultId, ids);
  };
  const purgeUnused = async (before: string[]) => {
    if (!current.current) return;
    const kept = info.current && !demoRef.current ? await historyBlobIds(info.current.vaultId) : new Set<string>();
    await purge(orphanedBlobs(before, current.current).filter(id => !kept.has(id)));
  };
  /**
   * Delete records. Normally an undo point is kept first; with `erase` (a whole client) the version history is wiped
   * instead, because it would otherwise keep the deleted person's data around.
   */
  const remove = async (change: (value: VaultData) => void, erase = false) => {
    const before = referencedBlobs(current.current ?? emptyVault());
    await flush();
    if (info.current && !demoRef.current && !erase) await recordSnapshot(info.current, true, Date.now(), before);
    await update(change);
    if (erase && info.current && !demoRef.current) await clearHistory();
    await purgeUnused(before);
  };
  const history = () => info.current && !demoRef.current ? listSnapshots(info.current.vaultId) : Promise.resolve([]);
  const restoreSnapshot = async (at: number) => {
    const env = info.current; if (!env || !key.current) throw new Error('locked');
    const snapshot = await readSnapshot(env.vaultId, at); if (!snapshot) throw new Error('noSnapshot');
    const value = await decryptVault(key.current, snapshot);
    await flush(); await recordSnapshot(env, true, Date.now(), referencedBlobs(current.current!));
    await restoreData(value);
  };
  const clearHistory = async () => {
    if (!info.current || !current.current || demoRef.current) return;
    await flush(); await clearSnapshots(info.current.vaultId);
    await purgeUnused((await allBlobs()).filter(blob => blob.vaultId === info.current!.vaultId).map(blob => blob.id));
  };
  const exportSnapshot = async (at: number) => {
    if (!info.current || !key.current || demoRef.current) throw new Error('locked');
    const envelope = await readSnapshot(info.current.vaultId, at); if (!envelope) throw new Error('noSnapshot');
    const value = await decryptVault(key.current, envelope);
    const ids = referencedBlobs(value); const blobs: EncryptedBlob[] = [];
    for (const id of ids) { const blob = await readBlob(id) ?? await downloadBlob(envelope.vaultId, id); if (!blob || blob.vaultId !== envelope.vaultId) throw new Error('storageError'); blobs.push(blob); }
    return { type: 'praxisraum-backup-v1', envelope: { ...envelope, salt: info.current.salt, wraps: info.current.wraps, format: info.current.format }, blobs };
  };

  // ---- backups, merging ----
  const exportBackup = async () => {
    await flush();
    if (demoRef.current || !info.current || !current.current) return;
    const snapshot = info.current;
    const ids = referencedBlobs(current.current);
    for (const id of ids) if (!await readBlob(id)) await downloadBlob(snapshot.vaultId, id);
    const blobs = (await allBlobs()).filter(b => b.vaultId === snapshot.vaultId && ids.includes(b.id));
    if (blobs.length !== ids.length) throw new Error('storageError');
    return { type: 'praxisraum-backup-v1', envelope: snapshot, blobs };
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
  /**
   * The cloud holds a newer revision (another device saved): fold its changes into this vault instead of failing.
   * Causal field registers retain independent edits and unresolved concurrent alternatives.
   */
  const mergeRemote = async () => {
    if (!current.current || !key.current || demoRef.current) throw new Error('locked');
    await flush();
    if (!current.current || !key.current || demoRef.current) throw new Error('locked');
    const before = referencedBlobs(current.current);
    const activeKey = key.current;
    const active = () => key.current === activeKey && !!current.current;
    const result = await fetchMerged(activeKey, current.current, info.current!, active);
    if (!active()) throw new Error('locked');
    let merged = result.data;
    // Edits made while decrypting/fetching must also survive. Worker joins run until the
    // snapshot is current; no await separates the final check from installing it.
    for (;;) {
      const generation = generationRef.current;
      merged = await runSecureTask('merge', { local: current.current!, remote: merged });
      if (!active()) throw new Error('locked');
      if (generation === generationRef.current) break;
    }
    const clientErased = current.current.clients.some(client => !merged.clients.some(remaining => remaining.id === client.id));
    current.current = merged; setData(merged); bump();
    const installedGeneration = generationRef.current;
    await persist(merged, { wraps: result.envelope.wraps, format: result.envelope.format });
    await setRevision(result.userId, result.vaultId, result.revision);
    if (clientErased) await clearHistory();
    await purgeUnused(before);
    return { data: merged, generation: installedGeneration };
  };
  const retry = () => current.current ? persist(current.current) : Promise.resolve();
  /** Replace the vault contents by an earlier version (undo of a deletion); stamped like a normal edit so other devices follow. */
  const restoreData = (value: VaultData) => update(next => {
    next.settings = structuredClone(value.settings);
    for (const name of ['clients', 'appointments', 'sessions', 'notes', 'invoices', 'assessments', 'templates', 'documents', 'availability'] as const) (next[name] as unknown[]) = value[name];
    for (const id of Object.keys(next.deleted)) if ([...value.clients, ...value.appointments, ...value.sessions, ...value.notes, ...value.invoices, ...value.assessments, ...value.templates, ...value.documents, ...value.availability].some(r => r.id === id)) delete next.deleted[id];
  });
  const getKey = () => key.current;
  return { envelope, data, saving, storageError, loadError, demo, generation, passphraseReset, create, unlock, unlockWithRecovery, unlockWithPasskey, openDemo, update, remove, purgeUnused, flush, snapshotForSync, getGeneration: () => generationRef.current, lock, addImage, image, addFile: addImage, file: image, exportBackup, exportSnapshot, importBackup, mergeRemote, retry, createRecoveryKey, addPasskey, removePasskey, changePassphrase, restoreData, getKey, history, restoreSnapshot, clearHistory };
}
export type VaultController = ReturnType<typeof useVault>;
