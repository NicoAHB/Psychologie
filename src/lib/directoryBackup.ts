export interface BackupWritable { write(data: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }
interface PermissionHandle { name: string; queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>; requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState> }
export interface BackupFile extends PermissionHandle { kind?: 'file'; createWritable(): Promise<BackupWritable> }
export interface BackupDirectory extends PermissionHandle {
  kind: 'directory';
  getFileHandle(name: string, options: { create: true }): Promise<BackupFile>;
  entries(): AsyncIterableIterator<[string, { kind: string }]>;
  removeEntry(name: string): Promise<void>;
}
export type BackupTarget = BackupFile | BackupDirectory;
export const BACKUP_COPIES = 30;
/** Create a new file first; prune only AFTER close() committed the complete ciphertext.
 * Never deletes other vaults' backups or arbitrary files in the selected directory. */
export async function writeBackupTarget(target: BackupTarget, vaultId: string, encryptedJson: string, now = new Date()): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(vaultId)) throw new Error('invalidBackup');
  const prefix = `praxisraum-${vaultId}-`;
  const name = `${prefix}${now.toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}.encrypted.json`;
  const file = target.kind === 'directory' ? await target.getFileHandle(name, { create: true }) : target;
  let writable: BackupWritable | undefined;
  try {
    writable = await file.createWritable(); await writable.write(encryptedJson); await writable.close();
  } catch (error) {
    await writable?.abort?.().catch(() => {});
    // Only this newly-created incomplete file can be removed on failure. Existing backups survive.
    if (target.kind === 'directory') await target.removeEntry(name).catch(() => {});
    throw error;
  }
  if (target.kind !== 'directory') return;
  const pattern = new RegExp(`^${prefix}\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}\\.\\d{3}Z-[0-9a-f-]{36}\\.encrypted\\.json$`, 'i');
  const names: string[] = [];
  for await (const [entry, handle] of target.entries()) if (handle.kind === 'file' && pattern.test(entry)) names.push(entry);
  // The just-committed file always survives, even if the system clock went backwards.
  const older = names.filter(entry => entry !== name).sort().reverse();
  for (const old of older.slice(BACKUP_COPIES - 1)) await target.removeEntry(old);
}
