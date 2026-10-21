import { useState, type FormEvent } from 'react';
import { ArrowRight, CloudDownload, Fingerprint, Flower2, KeyRound, LockKeyhole, ShieldCheck, Upload, LoaderCircle } from 'lucide-react';
import { passkeysAvailable } from '../lib/passkey';
import { LanguageSwitch, useI18n, type TextKey } from '../lib/i18n';
import type { VaultController } from '../lib/useVault';
import { cloudError, currentUser, fetchRemote, remoteEnvelope } from '../lib/cloud';
import { setRevision } from '../lib/db';
import { Botanical, Field, Logo, Modal, Notice } from './ui';
import { CloudAuth } from './CloudAuth';
export function Welcome({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const [passphrase, setPassphrase] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>(); const [restoreOpen, setRestoreOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false); const [recoveryKey, setRecoveryKey] = useState('');
  const exists = !!vault.envelope;
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!exists && (passphrase.length < 12 || passphrase !== confirm)) { setError('passphraseMismatch'); return; }
    setBusy(true);
    try { if (exists) await vault.unlock(passphrase); else await vault.create(passphrase); setPassphrase(''); setConfirm(''); }
    catch { setError(exists ? 'wrongPassphrase' : 'storageError'); } finally { setBusy(false); }
  }
  async function unlockWith(action: () => Promise<void>, failure: TextKey) {
    setBusy(true); setError(undefined);
    try { await action(); setRecoveryKey(''); } catch (err) { setError(err instanceof Error && err.message === 'invalidRecoveryKey' ? 'invalidRecoveryKey' : failure); } finally { setBusy(false); }
  }
  const passkeys = !!vault.envelope?.wraps?.passkeys?.length && passkeysAvailable();
  async function importFile(file?: File) {
    if (!file || (exists && !window.confirm(t('restoreConfirm')))) return;
    setBusy(true); setError(undefined);
    try { if (file.size > 100 * 1024 * 1024) throw new Error(); await vault.importBackup(JSON.parse(await file.text())); }
    catch { setError('invalidBackup'); } finally { setBusy(false); }
  }
  async function restoreCloud() {
    if (exists && !window.confirm(t('restoreConfirm'))) return;
    setBusy(true); setError(undefined);
    try {
      const user = await currentUser(); const remote = await fetchRemote(); if (!remote) throw new Error('noRemote');
      await vault.importBackup({ type: 'praxisraum-backup-v1', envelope: remoteEnvelope(remote), blobs: [] });
      await setRevision(user.id, remote.vault_id, remote.revision); setRestoreOpen(false);
    } catch (err) { setError(cloudError(err) as TextKey); } finally { setBusy(false); }
  }
  return <div className="welcome-page"><header className="welcome-header"><Logo/><LanguageSwitch/></header><main className="welcome-main">
    <section className="welcome-intro"><span className="eyebrow">{t('welcomeEyebrow')}</span><h1>{t('welcomeTitle')}</h1><p className="welcome-description">{t('welcomeText')}</p><div className="welcome-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><Botanical/><div className="art-label"><Flower2 size={25}/><span>{t('welcomePreviewTitle')}<small>{t('welcomePreviewText')}</small></span></div></div><div className="security-line"><ShieldCheck size={18}/>{t('welcomeSecurity')}</div></section>
    <section className="welcome-card"><span className="key-symbol"><KeyRound size={26}/></span><h2>{t(exists ? 'unlockTitle' : 'createVault')}</h2><p>{t(exists ? 'unlockText' : 'passphraseHint')}</p>
      {vault.loadError ? <Notice error>{t('loadError')}</Notice> : vault.envelope === undefined ? <LoaderCircle className="spin"/> : <form onSubmit={submit} noValidate>
        <Field label={t('passphrase')}><input autoFocus type="password" minLength={exists ? undefined : 12} maxLength={1024} value={passphrase} autoComplete={exists ? 'current-password' : 'new-password'} onChange={e => setPassphrase(e.target.value)} placeholder={t('passphrasePlaceholder')}/></Field>
        {!exists && <Field label={t('confirmPassphrase')}><input type="password" value={confirm} autoComplete="new-password" onChange={e => setConfirm(e.target.value)}/></Field>}
        {error && <Notice error>{t(error)}</Notice>}<button className="btn btn-primary btn-full" disabled={busy || !passphrase}>{busy ? <LoaderCircle size={18} className="spin"/> : <LockKeyhole size={18}/>} {t(busy ? 'working' : exists ? 'unlock' : 'createVault')}<ArrowRight size={18}/></button>
        {exists && passkeys && <button type="button" className="btn btn-secondary btn-full" disabled={busy} onClick={() => void unlockWith(() => vault.unlockWithPasskey(), 'passkeyFailed')}><Fingerprint size={18}/>{t('passkeyUnlock')}</button>}
        {exists && vault.envelope?.wraps?.recovery && <><button type="button" className="text-link" onClick={() => setRecoveryOpen(o => !o)}>{t('useRecovery')}</button>{recoveryOpen && <div className="recovery-input"><Field label={t('recoveryKeyInput')}><input value={recoveryKey} autoComplete="off" spellCheck={false} onChange={e => setRecoveryKey(e.target.value)} placeholder="XXXX-XXXX-XXXX-…"/></Field><button type="button" className="btn btn-secondary btn-full" disabled={busy || !recoveryKey.trim()} onClick={() => void unlockWith(() => vault.unlockWithRecovery(recoveryKey), 'invalidRecoveryKey')}><KeyRound size={17}/>{t('recoveryUnlock')}</button></div>}</>}
      </form>}
      <div className="welcome-divider"><span>{t('encryptedBadge')}</span></div><button className="btn btn-secondary btn-full" disabled={busy} onClick={() => void vault.openDemo().catch(() => setError('storageError'))}>{t('demo')}<ArrowRight size={17}/></button>
      <div className="restore-options"><label className="text-link file-label"><Upload size={15}/>{t('restore')}<input type="file" accept="application/json,.json" disabled={busy} onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }}/></label><button className="text-link" onClick={() => setRestoreOpen(true)}><CloudDownload size={15}/>{t('restoreCloud')}</button></div>
    </section></main><footer className="welcome-footer">{t('privacyFooter')}</footer>
    {restoreOpen && <Modal title={t('restoreCloud')} onClose={() => setRestoreOpen(false)}><CloudAuth><button className="btn btn-primary" disabled={busy} onClick={() => void restoreCloud()}>{t(busy ? 'working' : 'restoreCloud')}</button></CloudAuth>{error && <Notice error>{t(error)}</Notice>}</Modal>}
  </div>;
}
