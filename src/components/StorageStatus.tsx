import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCheck, Clock3, LoaderCircle } from 'lucide-react';
import { usePendingEdits } from '../lib/editStatus';
import { backupSourceId, readCloudSyncState, readExternalBackupState, type BackupState } from '../lib/backupState';
import { useI18n } from '../lib/i18n';
import type { VaultController } from '../lib/useVault';
import type { SettingsSection } from '../lib/practiceFlow';
import { Modal } from './ui';

export function StorageStatus({ vault, userId, onSettings }: { vault: VaultController; userId?: string; onSettings: (section: SettingsSection) => void }) {
  const { t, language } = useI18n(); const phase = usePendingEdits(); const [open,setOpen] = useState(false);
  const [copies,setCopies] = useState<{external?:BackupState;cloud?:BackupState}>({});
  const id = vault.envelope?.vaultId;
  useEffect(() => {
    let alive = true; setCopies({});
    if (!id || vault.demo) return;
    const read = () => { void Promise.all([readExternalBackupState(id),userId ? readCloudSyncState(id,userId) : Promise.resolve(undefined)]).then(([external,cloud]) => { if (alive) setCopies({external,cloud}); }).catch(() => {}); };
    read(); window.addEventListener('praxisraum-backup',read); return () => { alive=false; window.removeEventListener('praxisraum-backup',read); };
  },[id,userId,vault.demo]);
  const time = (at:number) => new Date(at).toLocaleString(language === 'uk' ? 'uk-UA' : 'de-DE', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const message = vault.storageError || phase === 'error' ? t('storageError') : phase === 'pending' ? t('savePending') : vault.saving || phase === 'saving' ? t('savingEncrypted') : vault.demo ? t('demoBadge') : vault.savedAt ? t('savedAtTime').replace('{time}',new Date(vault.savedAt).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'})) : t('saved');
  const current = vault.envelope ? backupSourceId(vault.envelope) : undefined;
  const copyStatus = (copy?:BackupState) => copy ? `${time(copy.at)} · ${t(copy.sourceId === current && phase === 'clean' && !vault.saving && !vault.storageError ? 'copyCurrent' : 'copyOlder')}` : t('copyUnknown');
  function settings(section:SettingsSection) {setOpen(false);onSettings(section);}
  return <><button className="storage-status-button" aria-label={t('storageStatus')} onClick={()=>setOpen(true)}>{vault.saving || phase === 'saving' ? <LoaderCircle size={15} className="spin"/> : vault.storageError || phase === 'error' ? <AlertTriangle size={16} aria-hidden="true"/> : phase === 'pending' ? <Clock3 size={16} aria-hidden="true"/> : <CheckCheck size={16} aria-hidden="true"/>}<span role="status">{message}</span></button>
    {open&&<Modal title={t('storageStatus')} onClose={()=>setOpen(false)}><dl className="storage-status-list"><div><dt>{t('storageLocal')}</dt><dd>{phase === 'clean' && !vault.saving && !vault.storageError && vault.savedAt && !vault.demo ? time(vault.savedAt) : message}</dd></div><div><dt>{t('storageCloud')}</dt><dd>{copyStatus(copies.cloud)}</dd></div><div><dt>{t('storageExternal')}</dt><dd>{copyStatus(copies.external)}</dd></div></dl><p className="hint">{t('storageStatusHint')}</p><div className="button-row"><button className="btn btn-secondary" onClick={()=>settings('backup')}>{t('securityTitle')}</button><button className="btn btn-secondary" onClick={()=>settings('cloud')}>{t('cloudTitle')}</button></div></Modal>}</>;
}
