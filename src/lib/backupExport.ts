import { today } from './dates';
import { downloadText } from './files';
import { markBackup } from './backupState';
import { runSecureTask } from './workerTasks';
import type { VaultController } from './useVault';

/** Hand the backup to the share sheet (iPad: "Save to Files"); falls back to a normal download. */
export async function saveBackupCopy(vault: VaultController, preferShare: boolean): Promise<'download' | 'share' | undefined> {
  const backup = await vault.exportBackup(); if (!backup) return;
  const name = `praxisraum-${today()}.encrypted.json`; const text = await runSecureTask('stringify', backup);
  const file = new File([text], name, { type: 'application/json' });
  let kind: 'download' | 'share' = 'download';
  if (preferShare && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Praxisraum' }); kind = 'share'; }
  else downloadText(name, text, 'application/json');
  await markBackup(backup.envelope.vaultId, kind);
  return kind;
}
