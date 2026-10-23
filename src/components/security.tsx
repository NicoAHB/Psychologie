import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Fingerprint, KeyRound, Printer, ShieldCheck, Trash2 } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { copyText } from '../lib/files';
import { passkeysAvailable } from '../lib/passkey';
import { AUTO_LOCK_MINUTES, autoLockMinutes } from '../lib/autoLock';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

type Mode = 'recovery' | 'passkey' | 'passphrase';
const errorKey = (err: unknown): TextKey => {
  const name = err instanceof Error ? err.name : ''; const message = err instanceof Error ? err.message : '';
  if (message === 'passkeyUnsupported') return 'passkeyUnsupported';
  if (name === 'NotAllowedError' || name === 'AbortError' || name === 'NotSupportedError' || name === 'SecurityError' || name === 'InvalidStateError' || message === 'passkeyFailed') return 'passkeyFailed';
  return 'wrongPassphrase'; // unwrapping with a wrong passphrase fails inside Web Crypto
};
/** Printable page for the recovery key, rendered into #print-root like the invoice. */
function RecoverySheet({ keyText }: { keyText: string }) {
  const { t } = useI18n();
  return <article className="invoice-sheet"><h1>{t('recoveryShowTitle')}</h1><p>{t('recoveryShowText')}</p><p className="recovery-key">{keyText}</p></article>;
}
function Dialog({ vault, mode, onClose }: { vault: VaultController; mode: Mode; onClose: () => void }) {
  const { t } = useI18n(); const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState(''); const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>(); const [key, setKey] = useState<string>(); const [saved, setSaved] = useState(false); const [copied, setCopied] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (mode === 'passphrase' && (next.length < 12 || next !== again)) { setError('passphraseMismatch'); return; }
    setBusy(true);
    try {
      if (mode === 'recovery') setKey(await vault.createRecoveryKey(current));
      else if (mode === 'passkey') { await vault.addPasskey(current, label); onClose(); }
      else { await vault.changePassphrase(next, current); onClose(); }
    } catch (err) { setError(errorKey(err)); } finally { setBusy(false); }
  }
  if (key) return <Modal title={t('recoveryShowTitle')} onClose={() => { if (saved) onClose(); }}>
    <Notice>{t('recoveryShowText')}</Notice><p className="recovery-key" data-testid="recovery-key">{key}</p>
    <div className="button-row"><button className="btn btn-secondary" onClick={async () => { await copyText(key); setCopied(true); }}><Copy size={16}/>{copied ? t('accessDone') : t('copyKey')}</button><button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16}/>{t('printKey')}</button></div>
    <label className="check-label"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)}/><span>{t('recoverySaved')}</span></label>
    <div className="form-actions"><button className="btn btn-primary" disabled={!saved} onClick={onClose}>{t('close')}</button></div>
    {document.getElementById('print-root') && createPortal(<RecoverySheet keyText={key}/>, document.getElementById('print-root')!)}</Modal>;
  return <Modal title={t(mode === 'recovery' ? (vault.envelope?.wraps?.recovery ? 'recoveryRenew' : 'recoveryCreate') : mode === 'passkey' ? 'passkeyAdd' : 'changePassphrase')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    {mode === 'passkey' && <Field label={t('passkeyLabel')}><input value={label} maxLength={60} onChange={e => setLabel(e.target.value)}/></Field>}
    <Field label={t(mode === 'passphrase' ? 'currentPassphrase' : 'confirmWithPassphrase')}><input type="password" autoFocus autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)}/></Field>
    {mode === 'passphrase' && <><Field label={t('newPassphrase')}><input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)}/></Field><Field label={t('confirmPassphrase')}><input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)}/></Field></>}
    {vault.envelope?.format !== 'praxisraum-v2' && <p className="hint">{t('accessUpgradeNote')}</p>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy || !current}>{t(busy ? 'working' : 'save')}</button></div>
  </form></Modal>;
}
export function SecurityCard({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const [mode, setMode] = useState<Mode>(); const [notice, setNotice] = useState<TextKey>();
  const wraps = vault.envelope?.wraps; const passkeys = wraps?.passkeys ?? []; const supported = passkeysAvailable();
  if (vault.demo) return null;
  return <section id="settings-security" tabIndex={-1} className="card settings-card"><span className="settings-icon tone-blue"><KeyRound size={24}/></span><h2>{t('securityAccess')}</h2><p>{t('accessText')}</p>
    <Field label={t('autoLockTimeout')} hint={t('autoLockHint')}><select value={autoLockMinutes(vault.data!.settings.autoLockMinutes)} onChange={e => { const minutes = Number(e.target.value); void vault.update(d => { d.settings.autoLockMinutes = autoLockMinutes(minutes); }).catch(() => setNotice('storageError')); }}>{AUTO_LOCK_MINUTES.map(minutes => <option key={minutes} value={minutes}>{t('autoLockOption').replace('{minutes}', String(minutes))}</option>)}</select></Field>
    <h3 className="mini-heading">{t('recoveryKey')} · <span className={wraps?.recovery ? 'ok-text' : 'warn-text'}>{t(wraps?.recovery ? 'recoveryOn' : 'recoveryOff')}</span></h3>
    <button className="btn btn-secondary" onClick={() => setMode('recovery')}><ShieldCheck size={16}/>{t(wraps?.recovery ? 'recoveryRenew' : 'recoveryCreate')}</button>
    <h3 className="mini-heading">{t('passkeys')}</h3>
    {passkeys.length ? <ul className="passkey-list">{passkeys.map(p => <li key={p.credentialId}><Fingerprint size={16}/><span>{p.label}</span><button className="icon-btn danger" aria-label={`${t('passkeyRemove')}: ${p.label}`} title={t('passkeyRemove')} onClick={() => { void vault.removePasskey(p.credentialId).then(() => setNotice('accessDone')).catch(() => {}); }}><Trash2 size={16}/></button></li>)}</ul> : <p className="hint">{t('passkeyNone')}</p>}
    <button className="btn btn-secondary" disabled={!supported} onClick={() => setMode('passkey')}><Fingerprint size={16}/>{t('passkeyAdd')}</button>
    <p className="hint">{t(supported ? 'passkeyHint' : 'passkeyUnsupported')}</p>
    <h3 className="mini-heading">{t('changePassphrase')}</h3><button className="btn btn-secondary" onClick={() => setMode('passphrase')}>{t('changePassphrase')}</button>
    {notice && <Notice>{t(notice)}</Notice>}
    {mode && <Dialog vault={vault} mode={mode} onClose={() => { setMode(undefined); setNotice('accessDone'); }}/>}</section>;
}
/** Shown right after unlocking with the recovery key: the forgotten passphrase has to be replaced. */
export function PassphraseReset({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const [next, setNext] = useState(''); const [again, setAgain] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  return <Modal title={t('resetPassphraseTitle')} onClose={() => { /* required step; locking the vault is the only way out */ }}><form noValidate onSubmit={async e => {
    e.preventDefault(); if (next.length < 12 || next !== again) { setError('passphraseMismatch'); return; }
    setBusy(true); try { await vault.changePassphrase(next); } catch { setError('storageError'); } finally { setBusy(false); }
  }}><Notice>{t('resetPassphraseText')}</Notice>
    <Field label={t('newPassphrase')}><input type="password" autoFocus autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)}/></Field>
    <Field label={t('confirmPassphrase')}><input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)}/></Field>
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => void vault.lock().catch(() => {})}>{t('lock')}</button><button className="btn btn-primary" disabled={busy || !next}>{t(busy ? 'working' : 'save')}</button></div></form></Modal>;
}
