import { useCallback, useEffect, useRef, useState } from 'react';
import { metaDelete, metaGet, metaPut } from './db';
import { markBackup } from './backupState';
import type { VaultController } from './useVault';
import { writeBackupTarget, type BackupTarget, type BackupFile, type BackupDirectory } from './directoryBackup';
import { runSecureTask } from './workerTasks';
export type { BackupFile } from './directoryBackup';

// File System Access API (Chromium on desktop): after the user picks a file once, every change is written to it.
type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<BackupFile>;
export type AutoBackupStatus = 'off' | 'ok' | 'working' | 'needsPermission' | 'error';
const pickerOf = () => (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
const directoryPicker = () => (window as unknown as { showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<BackupDirectory> }).showDirectoryPicker;
export const directoryBackupSupported = () => typeof window !== 'undefined' && typeof directoryPicker() === 'function';
export const autoBackupSupported = () => typeof window !== 'undefined' && (typeof pickerOf() === 'function' || directoryBackupSupported());
export const AUTO_BACKUP_DELAY_MS = 5000;

export function useAutoBackup(vault: VaultController) {
  const vaultId = vault.envelope?.vaultId; const open = !!vault.data && !vault.demo;
  const [file, setFile] = useState<BackupTarget | null>(null); const [status, setStatus] = useState<AutoBackupStatus>('off'); const [lastAt, setLastAt] = useState<number>();
  const busy = useRef(false); const queued = useRef(false); const latest = useRef(vault); latest.current = vault;
  const activeTarget = useRef<BackupTarget | null>(null);
  const key = vaultId ? `autobackup:${vaultId}` : '';
  useEffect(() => {
    activeTarget.current = null; setFile(null); setStatus('off');
    if (!open || !key || !autoBackupSupported()) { setFile(null); setStatus('off'); return; }
    let live = true;
    void metaGet<BackupTarget>(key).then(async stored => {
      if (!live || !stored) return;
      activeTarget.current = stored; setFile(stored);
      const permission = await stored.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt');
      if (live) setStatus(permission === 'granted' ? 'ok' : 'needsPermission');
    }).catch(() => {});
    return () => { live = false; activeTarget.current = null; };
  }, [open, key]);
  const write = useCallback(async function writeTarget(target: BackupTarget, interactive: boolean) {
    if (activeTarget.current !== target) return;
    if (busy.current) { queued.current = true; return; } busy.current = true;
    const generation = latest.current.generation;
    try {
      let permission = await target.queryPermission?.({ mode: 'readwrite' }) ?? 'granted';
      if (permission !== 'granted' && interactive) permission = await target.requestPermission?.({ mode: 'readwrite' }) ?? 'denied';
      if (permission !== 'granted') { setStatus('needsPermission'); return; }
      setStatus('working');
      const backup = await latest.current.exportBackup(); if (!backup || backup.envelope.vaultId !== vaultId) { setStatus('off'); return; }
      await writeBackupTarget(target, backup.envelope.vaultId, await runSecureTask('stringify', backup));
      const now = Date.now(); setLastAt(now); setStatus('ok'); if (vaultId) await markBackup(vaultId, 'auto', now);
    } catch { setStatus('error'); } finally { busy.current = false; const again = queued.current || generation !== latest.current.generation; queued.current = false; if (again && activeTarget.current === target && latest.current.data && latest.current.envelope?.vaultId === vaultId) void writeTarget(target, false); }
  }, [vaultId]);
  // Every change (and every pause in typing) schedules a write; leaving the page flushes immediately.
  useEffect(() => {
    if (!file || !open || status === 'needsPermission' || status === 'off') return;
    const timer = window.setTimeout(() => void write(file, false), AUTO_BACKUP_DELAY_MS);
    const hidden = () => { if (document.visibilityState === 'hidden') void write(file, false); };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [file, open, vault.generation, status === 'needsPermission' || status === 'off', write]);
  return {
    supported: autoBackupSupported(), directorySupported: directoryBackupSupported(), status, file, lastAt,
    async enable(directory = false) {
      const picked = directory ? await directoryPicker()!({ mode: 'readwrite', id: 'praxisraum-backups' }) : await pickerOf()!({ suggestedName: 'praxisraum-auto.encrypted.json', types: [{ description: 'Praxisraum', accept: { 'application/json': ['.json'] } }] });
      await metaPut(key, picked).catch(() => {}); // a browser that cannot store the handle still backs up for this session
      activeTarget.current = picked; setFile(picked); setStatus('ok'); await write(picked, true);
    },
    async disable() { activeTarget.current = null; queued.current = false; setFile(null); setStatus('off'); await metaDelete(key); },
    now: () => file ? write(file, true) : Promise.resolve(),
  };
}
export type AutoBackup = ReturnType<typeof useAutoBackup>;
