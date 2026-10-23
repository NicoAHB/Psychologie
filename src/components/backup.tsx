import { useEffect, useState } from 'react';
import { Download, HardDriveDownload, History, Share2, ShieldCheck } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { today } from '../lib/dates';
import { downloadText } from '../lib/files';
import { markBackup } from '../lib/backupState';
import type { SnapshotEntry } from '../lib/history';
import type { AutoBackup } from '../lib/useAutoBackup';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';
import { runSecureTask } from '../lib/workerTasks';

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
export function BackupCard({ vault, auto }: { vault: VaultController; auto: AutoBackup }) {
  const { t, language } = useI18n(); const [message, setMessage] = useState<TextKey>(); const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const canShare = typeof navigator.canShare === 'function' && typeof File === 'function';
  const run = async (share: boolean) => {
    setBusy(true); setMessage(undefined);
    try { if (await saveBackupCopy(vault, share)) setMessage('backupSuccess'); } catch (err) { if ((err as Error).name !== 'AbortError') setMessage('imageError'); } finally { setBusy(false); }
  };
  const time = (at: number) => new Date(at).toLocaleString(language === 'de' ? 'de-DE' : 'uk-UA');
  return <section className="card settings-card"><span className="settings-icon"><ShieldCheck size={24}/></span><h2>{t('securityTitle')}</h2><p>{t('securityText')}</p>
    <div className="button-row"><button className="btn btn-secondary" disabled={busy || vault.demo} onClick={() => void run(false)}><Download size={17}/>{t(busy ? 'working' : 'exportBackup')}</button>
      {canShare && <button className="btn btn-secondary" disabled={busy || vault.demo} onClick={() => void run(true)}><Share2 size={17}/>{t('shareBackup')}</button>}</div>
    <p className="hint">{t('backupHelp')}</p><p className="hint">{t('backupExternalHint')}</p><button className="btn btn-secondary" disabled={vault.demo} onClick={() => setVerifying(true)}>{t('backupVerify')}</button>{verifying && <BackupVerifyDialog onClose={() => setVerifying(false)}/>}{message && <Notice>{t(message)}</Notice>}
    <h3 className="mini-heading">{t('autoBackup')}</h3>
    {!auto.supported ? <p className="hint">{t('autoBackupUnsupported')}</p> : <>
      <p className="hint">{t('autoBackupText')}</p>
      {auto.file ? <>
        <p className="hint">{t('autoBackupFile')} <strong>{auto.file.name}</strong>{auto.status === 'ok' && auto.lastAt ? ` · ${t('autoBackupOk')} ${time(auto.lastAt)}` : ''}{auto.status === 'working' ? ` · ${t('autoBackupWorking')}` : ''}</p>
        {auto.status === 'needsPermission' && <Notice>{t('autoBackupNeedsPermission')}</Notice>}{auto.status === 'error' && <Notice error>{t('autoBackupError')}</Notice>}
        <div className="button-row"><button className="btn btn-secondary" onClick={() => void auto.now()}><HardDriveDownload size={17}/>{t(auto.status === 'needsPermission' ? 'autoBackupResume' : 'autoBackupNow')}</button><button className="btn btn-ghost" onClick={() => void auto.disable()}>{t('autoBackupOff')}</button></div></>
        : <div className="button-row">{auto.directorySupported && <button className="btn btn-primary" disabled={vault.demo} onClick={() => void auto.enable(true).catch(() => {})}><HardDriveDownload size={17}/>{t('backupDirectoryChoose')}</button>}<button className="btn btn-secondary" disabled={vault.demo} onClick={() => void auto.enable().catch(() => {})}><HardDriveDownload size={17}/>{t('autoBackupSetup')}</button></div>}{auto.directorySupported && <p className="hint">{t('backupDirectoryHint')}</p>}</>}
  </section>;
}
export function HistoryCard({ vault }: { vault: VaultController }) {
  const { t, language } = useI18n(); const [entries, setEntries] = useState<SnapshotEntry[]>([]); const [done, setDone] = useState(false);
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const refresh = () => { void vault.history().then(setEntries).catch(() => {}); };
  useEffect(refresh, [vault.generation, vault.envelope]);
  if (vault.demo) return null;
  const label = (e: SnapshotEntry) => `${new Date(e.at).toLocaleString(language === 'de' ? 'de-DE' : 'uk-UA')} · ${t(e.reason === 'delete' ? 'historyReasonDelete' : e.reason === 'checkpoint' ? 'historyReasonCheckpoint' : 'historyReasonAuto')}`;
  async function download(at: number) {
    setBusy(true); setError(false);
    try { const backup = await vault.exportSnapshot(at); downloadText(`praxisraum-${new Date(at).toISOString().replaceAll(':', '-')}.encrypted.json`, await runSecureTask('stringify', backup), 'application/json'); await markBackup(backup.envelope.vaultId, 'download'); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <section className="card settings-card"><span className="settings-icon tone-beige"><History size={24}/></span><h2>{t('history')}</h2><p>{t('historyText')}</p>
    {entries.length ? <ul className="passkey-list">{entries.slice(0, all ? undefined : 10).map(e => <li key={e.at}><span>{label(e)}</span><button className="btn btn-secondary btn-small" disabled={busy} aria-label={`${t('historyDownload')} ${label(e)}`} onClick={() => void download(e.at)}><Download size={15}/>{t('historyDownload')}</button><button className="btn btn-secondary btn-small" disabled={busy} onClick={() => { if (window.confirm(t('historyConfirm'))) void vault.restoreSnapshot(e.at).then(() => { setDone(true); refresh(); }).catch(() => setError(true)); }}>{t('historyRestore')}</button></li>)}</ul> : <p className="hint">{t('historyEmpty')}</p>}
    {!all && entries.length > 10 && <button className="text-link" onClick={() => setAll(true)}>{t('followUpShowMore')}</button>}
    {error && <Notice error>{t('storageError')}</Notice>}
    {done && <Notice>{t('historyRestored')}</Notice>}
    {entries.length > 0 && <button className="btn btn-ghost" onClick={() => { void vault.clearHistory().then(refresh); }}>{t('historyClear')}</button>}</section>;
}

function BackupVerifyDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n(); const [file, setFile] = useState<File>(), [passphrase, setPassphrase] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false), [result, setResult] = useState<import('../lib/verifyBackup').BackupCheck>();
  async function check() { if (!file) return; setBusy(true); setError(false); setResult(undefined); try { setResult(await runSecureTask('verifyBackup', { text: await file.text(), passphrase })); setPassphrase(''); } catch { setError(true); } finally { setBusy(false); } }
  return <Modal title={t('backupVerify')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={e => { e.preventDefault(); void check(); }}><p>{t('backupVerifyHint')}</p><Field label={t('backupVerifyFile')}><input type="file" accept=".json,application/json" disabled={busy} onChange={e => { setFile(e.target.files?.[0]); setResult(undefined); setError(false); }}/></Field><Field label={t('backupVerifyPassphrase')}><input type="password" autoComplete="off" value={passphrase} disabled={busy} onChange={e => setPassphrase(e.target.value)}/></Field>{busy && <p role="status">{t('backupVerifying')}</p>}{error && <Notice error>{t('backupVerifyError')}</Notice>}{result && <Notice>{Object.entries(result).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), t('backupVerified'))}</Notice>}<div className="form-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>{t('close')}</button><button className="btn btn-primary" disabled={busy || !file || !passphrase}>{t('backupVerify')}</button></div></form></Modal>;
}
