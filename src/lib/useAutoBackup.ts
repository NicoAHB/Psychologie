import { useCallback, useEffect, useRef, useState } from 'react';
import { metaDelete, metaGet, metaPut } from './db';
import { markBackup } from './backupState';
import type { VaultController } from './useVault';

// File System Access API (Chromium on desktop): after the user picks a file once, every change is written to it.
interface Writable { write(data: string): Promise<void>; close(): Promise<void> }
export interface BackupFile { name: string; createWritable(): Promise<Writable>; queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>; requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState> }
type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<BackupFile>;
export type AutoBackupStatus = 'off' | 'ok' | 'working' | 'needsPermission' | 'error';
const pickerOf = () => (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
export const autoBackupSupported = () => typeof window !== 'undefined' && typeof pickerOf() === 'function';
export const AUTO_BACKUP_DELAY_MS = 5000;

export function useAutoBackup(vault: VaultController) {
  const vaultId = vault.envelope?.vaultId; const open = !!vault.data && !vault.demo;
  const [file, setFile] = useState<BackupFile | null>(null); const [status, setStatus] = useState<AutoBackupStatus>('off'); const [lastAt, setLastAt] = useState<number>();
  const busy = useRef(false); const latest = useRef(vault); latest.current = vault;
  const key = vaultId ? `autobackup:${vaultId}` : '';
  useEffect(() => {
    if (!open || !key || !autoBackupSupported()) { setFile(null); setStatus('off'); return; }
    let live = true;
    void metaGet<BackupFile>(key).then(async stored => {
      if (!live || !stored) return;
      setFile(stored);
      setStatus((await stored.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt')) === 'granted' ? 'ok' : 'needsPermission');
    }).catch(() => {});
    return () => { live = false; };
  }, [open, key]);
  const write = useCallback(async (target: BackupFile, interactive: boolean) => {
    if (busy.current) return; busy.current = true;
    try {
      let permission = await target.queryPermission?.({ mode: 'readwrite' }) ?? 'granted';
      if (permission !== 'granted' && interactive) permission = await target.requestPermission?.({ mode: 'readwrite' }) ?? 'denied';
      if (permission !== 'granted') { setStatus('needsPermission'); return; }
      setStatus('working');
      const backup = await latest.current.exportBackup(); if (!backup) return;
      const writable = await target.createWritable(); await writable.write(JSON.stringify(backup)); await writable.close();
      const now = Date.now(); setLastAt(now); setStatus('ok'); if (vaultId) await markBackup(vaultId, 'auto', now);
    } catch { setStatus('error'); } finally { busy.current = false; }
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
    supported: autoBackupSupported(), status, file, lastAt,
    async enable() {
      const picked = await pickerOf()!({ suggestedName: 'praxisraum-auto.encrypted.json', types: [{ description: 'Praxisraum', accept: { 'application/json': ['.json'] } }] });
      await metaPut(key, picked).catch(() => {}); // a browser that cannot store the handle still backs up for this session
      setFile(picked); setStatus('ok'); await write(picked, true);
    },
    async disable() { await metaDelete(key); setFile(null); setStatus('off'); },
    now: () => file ? write(file, true) : Promise.resolve(),
  };
}
export type AutoBackup = ReturnType<typeof useAutoBackup>;
