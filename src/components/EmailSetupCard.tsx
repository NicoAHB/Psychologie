import { useEffect, useRef, useState } from 'react';
import { Mail, CheckCircle2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { cloudConfigured } from '../lib/cloud';
import { registerBeforeLock } from '../lib/autoLock';
import { emailErrorKey, getEmailStatus, saveEmailSettings, sendEmailTest, type EmailStatus } from '../lib/emailSettings';
import { useI18n, type TextKey } from '../lib/i18n';
import { uid } from '../lib/types';
import { validEmail } from '../lib/documents';
import { useSaveStatus } from '../lib/useSaveStatus';
import { CloudAuth, useCloudUser } from './CloudAuth';
import { Field, Modal, Notice } from './ui';
import { SaveButton } from './SaveButton';

export function EmailSetupCard({ demo = false, embedded = false }: { demo?: boolean; embedded?: boolean }) {
  const { t, language } = useI18n(), user = useCloudUser(!demo);
  const [status, setStatus] = useState<EmailStatus>(), [error, setError] = useState<TextKey>();
  const [senderEmail, setSenderEmail] = useState(''), [senderName, setSenderName] = useState(''), [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(true), [reveal, setReveal] = useState(false), [loading, setLoading] = useState(false), [testing, setTesting] = useState(false);
  const [testedAt, setTestedAt] = useState<string>(), [copied, setCopied] = useState<string>();
  const [migration, setMigration] = useState('');
  const save = useSaveStatus(), controller = useRef<AbortController | undefined>(undefined), testAttempt = useRef<{ id: string; at: number } | undefined>(undefined);
  const busy = loading || save.saving || testing;
  const apply = (v: EmailStatus) => { setStatus(v); setSenderEmail(v.senderEmail); setSenderName(v.senderName); setEnabled(v.source === 'none' || v.enabled); };
  useEffect(() => {
    const c = new AbortController(); controller.current = c;
    const unregister = registerBeforeLock(async () => { c.abort(); setApiKey(''); setReveal(false); });
    setStatus(undefined); setApiKey(''); setTestedAt(undefined); testAttempt.current = undefined;
    if (user && !demo) {
      setLoading(true); setError(undefined);
      void getEmailStatus(c.signal).then(v => { if (!c.signal.aborted) apply(v); }, err => { if (!c.signal.aborted) setError(emailErrorKey(err)); })
        .finally(() => { if (!c.signal.aborted) setLoading(false); });
    }
    return () => { c.abort(); unregister(); };
  }, [user, demo]);
  const changed = () => { save.changed(); setTestedAt(undefined); setError(undefined); testAttempt.current = undefined; };
  const refresh = async () => {
    const signal = controller.current?.signal;
    setLoading(true); setError(undefined);
    try { const v = await getEmailStatus(signal); if (!signal?.aborted) { apply(v); setApiKey(''); save.changed(); } }
    catch (err) { if (!signal?.aborted) setError(emailErrorKey(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  };
  const persist = async () => {
    const signal = controller.current?.signal;
    setError(undefined);
    try { await save.save(async () => {
      const v = await saveEmailSettings({ senderEmail: senderEmail.trim(), senderName: senderName.trim(), apiKey: apiKey.trim(), enabled }, signal);
      if (!signal?.aborted) { apply(v); setApiKey(''); setReveal(false); testAttempt.current = undefined; }
    }); } catch (err) { if (!signal?.aborted) setError(emailErrorKey(err)); }
  };
  const test = async () => {
    const signal = controller.current?.signal;
    if (!status?.ready || busy) return;
    if (testAttempt.current && Date.now() - testAttempt.current.at >= 23 * 3600000) { setError('emailRetryExpired'); return; }
    testAttempt.current ??= { id: uid(), at: Date.now() }; setTesting(true); setError(undefined);
    try { const at = await sendEmailTest(language, testAttempt.current.id, signal); if (!signal?.aborted) { setTestedAt(at); testAttempt.current = undefined; } }
    catch (err) { if (!signal?.aborted) setError(emailErrorKey(err)); }
    finally { if (!signal?.aborted) setTesting(false); }
  };
  const copy = async (kind: string, value: string) => { try { await navigator.clipboard.writeText(value); setCopied(kind); } catch { setError('emailCopyFailed'); } };
  const dirty = !!status && (senderEmail.trim() !== status.senderEmail || senderName.trim() !== status.senderName || enabled !== status.enabled || !!apiKey.trim());
  return <section id={embedded ? undefined : 'settings-email'} tabIndex={-1} className={embedded ? 'email-setup' : 'card settings-card email-setup'} aria-label={t('emailSetupTitle')}>
    {!embedded && <><span className="settings-icon tone-blue"><Mail size={24}/></span><h2>{t('emailSetupTitle')}</h2></>}
    <p>{t('emailSetupIntro')}</p>
    <details className="email-setup-help" open={!status?.keyStored}><summary>{t('emailSetupStepsTitle')}</summary><ol className="email-setup-steps">
      <li><strong>{t('emailSetupAccountTitle')}</strong><p>{t('emailSetupAccountHint')}</p><a className="btn btn-secondary" href="https://resend.com/signup" target="_blank" rel="noopener noreferrer">{t('emailSetupCreateAccount')}<ExternalLink size={16} aria-hidden="true"/></a></li>
      <li><strong>{t('emailSetupSenderTitle')}</strong><p>{t('emailSetupSenderHint')}</p><div className="button-row"><a className="text-link" href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">{t('emailSetupDomains')}</a><a className="text-link" href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer">{t('emailSetupKeys')}</a></div></li>
      <li><strong>{t('emailSetupConnectTitle')}</strong><p>{t('emailSetupConnectHint')}</p></li>
    </ol></details>
    {demo ? <Notice>{t('demoNotice')}</Notice> : !cloudConfigured ? <Notice>{t('emailSetupCloudMissing')}</Notice> : <CloudAuth>
      <div className="email-setup-status" role="status" aria-live="polite">{loading ? t('emailSetupChecking') : status?.ready ? <><CheckCircle2 size={20} aria-hidden="true"/>{t('emailSetupReady')}</> : t(status?.source === 'saved' && !status.enabled ? 'emailSetupPaused' : 'emailSetupIncomplete')}</div>
      <button type="button" className="btn btn-secondary" disabled={busy || dirty} onClick={() => void refresh()}>{t('emailSetupRefresh')}</button>
      {status?.editable && <form onSubmit={e => { e.preventDefault(); void persist(); }} noValidate>
        <Field label={t('emailSetupSenderName')}><input value={senderName} maxLength={100} autoComplete="organization" disabled={busy} onChange={e => { setSenderName(e.target.value); changed(); }}/></Field>
        <Field label={t('emailSetupSenderAddress')} hint={t('emailSetupSenderAddressHint')}><input type="email" value={senderEmail} maxLength={254} autoComplete="email" disabled={busy} onChange={e => { setSenderEmail(e.target.value); changed(); }}/></Field>
        <Field label={t('emailSetupApiKey')} hint={t(status.keyStored ? 'emailSetupKeySaved' : 'emailSetupKeyHint')}><input type={reveal ? 'text' : 'password'} value={apiKey} maxLength={203} autoComplete="off" spellCheck={false} autoCapitalize="none" disabled={busy} placeholder={t(status.keyStored ? 'emailSetupKeyPlaceholderSaved' : 'emailSetupKeyPlaceholder')} onChange={e => { setApiKey(e.target.value); changed(); }}/></Field>
        <button type="button" className="btn btn-ghost" disabled={busy || !apiKey} aria-pressed={reveal} onClick={() => setReveal(v => !v)}>{reveal ? <EyeOff size={16}/> : <Eye size={16}/>} {t(reveal ? 'emailSetupHideKey' : 'emailSetupShowKey')}</button>
        <label className="check-label"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => { setEnabled(e.target.checked); changed(); }}/><span>{t('emailSetupEnabled')}</span></label>
        <p className="hint">{t('emailSetupStorageHint')}</p>
        <SaveButton status={save} disabled={!dirty || busy || !validEmail(senderEmail.trim()) || /[\x00-\x1f\x7f<>]/.test(senderName) || (!apiKey.trim() && !status.keyStored) || (!!apiKey.trim() && !/^re_[A-Za-z0-9_-]{10,200}$/.test(apiKey.trim()))}/>
      </form>}
      {status?.ready && <div className="email-setup-test"><h3>{t('emailSetupTestTitle')}</h3><p>{t('emailSetupTestHint').replace('{email}', status.accountEmail || '—')}</p><button type="button" className="btn btn-secondary" disabled={busy || dirty || !status.accountEmail || !!testedAt} onClick={() => void test()}>{t(testing ? 'working' : 'emailSetupSendTest')}</button>{dirty && <p className="hint">{t('emailSetupSaveFirst')}</p>}{testedAt && <Notice>{t('emailSetupTestAccepted')} <time dateTime={testedAt}>{new Date(testedAt).toLocaleString(language === 'de' ? 'de-DE' : 'uk-UA')}</time></Notice>}</div>}
    </CloudAuth>}
    {error && <Notice error>{t(error)}</Notice>}
    {!demo && (!cloudConfigured || !status || !status.editable) && <details className="email-setup-bootstrap" onToggle={e => { if (e.currentTarget.open && !migration) void import('../../supabase/email-settings.sql?raw').then(m => setMigration(m.default), () => setError('emailConnectionError')); }}><summary>{t('emailSetupBootstrapTitle')}</summary><p>{t('emailSetupBootstrapHint')}</p>
      <ol><li>{t('emailSetupBootstrapCloud')} <a className="text-link" href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">{t('emailSetupOpenSupabase')}</a></li>
        <li>{t('emailSetupBootstrapSql')}<button type="button" className="btn btn-secondary" disabled={!migration} onClick={() => void copy('sql', migration)}>{t(copied === 'sql' ? 'emailSetupCopied' : 'emailSetupCopySql')}</button><details><summary>{t('emailSetupShowSql')}</summary><pre tabIndex={0}>{migration || t('working')}</pre></details></li>
        <li>{t('emailSetupBootstrapFunction')}{user && /^[0-9a-f-]{36}$/i.test(user) && <><p className="hint">{t('emailSetupUserId')} <code>{user}</code></p><button type="button" className="btn btn-secondary" onClick={() => void copy('commands', `supabase secrets set APP_ORIGIN=${window.location.origin} EMAIL_OWNER_USER_ID=${user} MARKETING_OWNER_USER_ID=${user}\nsupabase functions deploy send-client-email --no-verify-jwt\nsupabase functions deploy send-marketing --no-verify-jwt`)}>{t(copied === 'commands' ? 'emailSetupCopied' : 'emailSetupCopyCommands')}</button></>}</li></ol>
      <p className="hint">{t('emailSetupBootstrapSecurity')}</p></details>}
    <p className="hint">{t('emailSetupPrivacy')}</p>
  </section>;
}
export function EmailSetupButton({ demo = false }: { demo?: boolean }) {
  const { t } = useI18n(), [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}><Mail size={17}/>{t('emailSetupOpen')}</button>{open && <Modal title={t('emailSetupTitle')} onClose={() => setOpen(false)}><EmailSetupCard demo={demo} embedded/></Modal>}</>;
}
