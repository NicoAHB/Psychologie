import { useEffect, useId, useRef, useState } from 'react';
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
import { emailFingerprint, markEmailProof, readEmailProof, type EmailProof } from '../lib/setupProof';
import { newGmailConnectionKey, validGmailAddress, validGmailEndpoint, validProviderCredential, type EmailProviderKind } from '../lib/emailConnection';

export function EmailSetupCard({ demo = false, embedded = false }: { demo?: boolean; embedded?: boolean }) {
  const { t, language } = useI18n(), user = useCloudUser(!demo);
  const [status, setStatus] = useState<EmailStatus>(), [error, setError] = useState<TextKey>();
  const [senderEmail, setSenderEmail] = useState(''), [senderName, setSenderName] = useState(''), [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(true), [reveal, setReveal] = useState(false), [loading, setLoading] = useState(false), [testing, setTesting] = useState(false);
  const [testedAt, setTestedAt] = useState<string>(), [copied, setCopied] = useState<string>();
  const [migration, setMigration] = useState(''), [gmailScript, setGmailScript] = useState('');
  const wizardId = useId();
  const [proof, setProof] = useState<EmailProof>(), [proofError, setProofError] = useState(false), [confirming, setConfirming] = useState(false), [showScript, setShowScript] = useState(false), [receiptPending, setReceiptPending] = useState<boolean>();
  const [provider, setProvider] = useState<EmailProviderKind>('gmail'), [endpoint, setEndpoint] = useState('');
  useEffect(() => { if (provider === 'gmail' && !gmailScript) void import('../../examples/gmail-praxisraum.gs?raw').then(m => setGmailScript(m.default), () => setError('emailConnectionError')); }, [provider, gmailScript]);
  const testInFlight = useRef(false);
  const save = useSaveStatus(), controller = useRef<AbortController | undefined>(undefined), testAttempt = useRef<{ id: string; at: number } | undefined>(undefined);
  const busy = loading || save.saving || testing || confirming;
  const apply = (v: EmailStatus) => { setStatus(v); setSenderEmail(v.senderEmail); setSenderName(v.senderName); setEnabled(v.source === 'none' || v.enabled); if (v.source !== 'none') setProvider(v.provider); setEndpoint(v.endpoint); };
  useEffect(() => {
    const c = new AbortController(); controller.current = c;
    const unregister = registerBeforeLock(async () => { c.abort(); setApiKey(''); setReveal(false); setShowScript(false); });
    setStatus(undefined); setApiKey(''); setLoading(false); setTestedAt(undefined); testAttempt.current = undefined;
    if (user && !demo) {
      setLoading(true); setError(undefined);
      void getEmailStatus(c.signal).then(v => { if (!c.signal.aborted) apply(v); }, err => { if (!c.signal.aborted) setError(emailErrorKey(err)); })
        .finally(() => { if (!c.signal.aborted) setLoading(false); });
    }
    return () => { c.abort(); unregister(); };
  }, [user, demo]);
  const changed = () => { save.changed(); setTestedAt(undefined); setProof(undefined); setProofError(false); setError(undefined); setCopied(undefined); testAttempt.current = undefined; };
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
      const v = await saveEmailSettings({ senderEmail: senderEmail.trim(), senderName: senderName.trim(), apiKey: apiKey.trim(), enabled, provider, endpoint: provider === 'gmail' ? endpoint.trim() : '' }, signal);
      if (!signal?.aborted) { apply(v); setApiKey(''); setReveal(false); testAttempt.current = undefined; }
    }); } catch (err) { if (!signal?.aborted) setError(emailErrorKey(err)); }
  };
  const test = async () => {
    const signal = controller.current?.signal;
    if (!status?.ready || !user || busy || testInFlight.current) return;
    if (testAttempt.current && Date.now() - testAttempt.current.at >= 23 * 3600000) { setError('emailRetryExpired'); return; }
    testInFlight.current = true; setTesting(true); setError(undefined);
    try {
      const fingerprint = await emailFingerprint(user, status);
      if (signal?.aborted) return;
      testAttempt.current ??= { id: uid(), at: Date.now() };
      const at = await sendEmailTest(language, testAttempt.current.id, signal);
      if (!signal?.aborted) {
        setTestedAt(at); testAttempt.current = undefined;
        const value = { fingerprint, acceptedAt: Date.parse(at) }; setProof(value); setProofError(false);
        try { await markEmailProof(user, fingerprint, value.acceptedAt); } catch { setProofError(true); }
      }
    } catch (err) { if (!signal?.aborted) setError(emailErrorKey(err)); }
    finally { testInFlight.current = false; if (!signal?.aborted) setTesting(false); }
  };
  const copy = async (kind: string, value: string) => { try { await navigator.clipboard.writeText(value); setCopied(kind); } catch { setError('emailCopyFailed'); } };
  const storedKey = !!status?.keyStored && provider === status.provider;
  const dirty = !!status && (provider !== (status.source === 'none' ? 'gmail' : status.provider) || endpoint.trim() !== status.endpoint || senderEmail.trim() !== status.senderEmail || senderName.trim() !== status.senderName || enabled !== (status.source === 'none' || status.enabled) || !!apiKey.trim());
  useEffect(() => {
    let active = true; setProof(undefined); setTestedAt(undefined);
    if (user && status?.ready && !dirty) void emailFingerprint(user, status).then(fingerprint => readEmailProof(user, fingerprint)).then(value => {
      if (active && value) { setProof(value); setTestedAt(new Date(value.acceptedAt).toISOString()); }
    }).catch(() => { if (active) setProofError(true); });
    return () => { active = false; };
  }, [user, status, dirty]);
  const confirmReceipt = async (checked: boolean) => {
    if (!proof || !user || busy || dirty) return; setReceiptPending(checked); setConfirming(true); setProofError(false);
    const next = { ...proof, confirmedAt: checked ? Date.now() : undefined };
    try { await markEmailProof(user, next.fingerprint, next.acceptedAt, next.confirmedAt); setProof(next); }
    catch { setProofError(true); } finally { setConfirming(false); setReceiptPending(undefined); }
  };
  const focusStep = (step: string) => { const target = step === 'server' && (!cloudConfigured || !!user && !status?.editable) ? 'technical' : step; const node = document.getElementById(`${wizardId}-${target}`) ?? document.getElementById(`${wizardId}-server`); const details = node instanceof HTMLDetailsElement ? node : step === 'connection' ? node?.querySelector('details') : null; if (details) details.open = true; if (step === 'test' && !status?.ready) setError('emailWizardTestNotReady'); node?.focus(); node?.scrollIntoView({ block: 'start', behavior: 'auto' }); };
  const serverReady = !!(user && status?.editable);
  const connectionReady = !!status?.ready && !dirty;
  return <section id={embedded ? undefined : 'settings-email'} tabIndex={-1} className={embedded ? 'email-setup' : 'card settings-card email-setup'} aria-label={t('emailSetupTitle')}>
    {!embedded && <><span className="settings-icon tone-blue"><Mail size={24}/></span><h2>{t('emailSetupTitle')}</h2></>}
    <p>{t('emailSetupIntro')}</p>
    <ol role="list" className="email-wizard-steps" aria-label={t('emailWizardTitle')}>{([
      ['server', 'emailWizardServer', serverReady], ['connection', 'emailWizardConnection', connectionReady], ['test', 'emailWizardTest', !!proof?.confirmedAt && connectionReady],
    ] as const).map(([id, label, done], index) => <li key={id}><button type="button" className="setup-step" onClick={() => focusStep(id)}><span className="setup-step-number" aria-hidden="true">{done ? '✓' : index + 1}</span><span><strong>{t(label)}</strong><small>{t(done ? 'emailWizardDone' : 'emailWizardOpen')}</small></span></button></li>)}</ol>
    <Field label={t('emailProviderChoice')}><select value={provider} disabled={busy} onChange={e => { const next = e.target.value as EmailProviderKind; setProvider(next); setApiKey(''); setReveal(false); setEndpoint(next === status?.provider ? status.endpoint : ''); changed(); }}><option value="gmail">{t('emailProviderGmail')}</option><option value="resend">{t('emailProviderResend')}</option></select></Field>
    <div id={`${wizardId}-connection`} tabIndex={-1}>
    {provider === 'gmail' && <details className="email-setup-help" open={serverReady && !storedKey}><summary>{t('emailGmailStepsTitle')}</summary><ol className="email-setup-steps"><li><strong>{t('emailGmailStep1Title')}</strong><p>{t('emailGmailStep1')}</p></li><li><strong>{t('emailGmailStep2Title')}</strong><p>{t('emailGmailStep2')}</p><a className="btn btn-secondary" href="https://script.google.com/home/start" target="_blank" rel="noopener noreferrer">{t('emailGmailOpenScript')}<ExternalLink size={16} aria-hidden="true"/></a></li><li><strong>{t('emailGmailStep3Title')}</strong><p>{t('emailGmailStep3')}</p></li><li><strong>{t('emailGmailStep4Title')}</strong><p>{t('emailGmailStep4')}</p></li></ol><p className="hint">{t('emailGmailLimits')}</p></details>}
    {provider === 'resend' && <details className="email-setup-help" open={serverReady && !storedKey}><summary>{t('emailSetupStepsTitle')}</summary><ol className="email-setup-steps">
      <li><strong>{t('emailSetupAccountTitle')}</strong><p>{t('emailSetupAccountHint')}</p><a className="btn btn-secondary" href="https://resend.com/signup" target="_blank" rel="noopener noreferrer">{t('emailSetupCreateAccount')}<ExternalLink size={16} aria-hidden="true"/></a></li>
      <li><strong>{t('emailSetupSenderTitle')}</strong><p>{t('emailSetupSenderHint')}</p><div className="button-row"><a className="text-link" href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">{t('emailSetupDomains')}</a><a className="text-link" href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer">{t('emailSetupKeys')}</a></div></li>
      <li><strong>{t('emailSetupConnectTitle')}</strong><p>{t('emailSetupConnectHint')}</p></li>
    </ol></details>}
    </div>
    <div id={`${wizardId}-server`} tabIndex={-1}>
    {demo ? <Notice>{t('demoNotice')}</Notice> : !cloudConfigured ? <Notice>{t('emailSetupCloudMissing')}</Notice> : <CloudAuth>
      <div className="email-setup-status" role="status" aria-live="polite">{loading ? t('emailSetupChecking') : status?.ready ? <><CheckCircle2 size={20} aria-hidden="true"/>{t('emailSetupReady')}</> : t(status?.source === 'saved' && !status.enabled ? 'emailSetupPaused' : 'emailSetupIncomplete')}</div>
      <button type="button" className="btn btn-secondary" disabled={busy || dirty} onClick={() => void refresh()}>{t('emailSetupRefresh')}</button>
      {status?.editable && <form onSubmit={e => { e.preventDefault(); void persist(); }} noValidate>
        <Field label={t('emailSetupSenderName')}><input value={senderName} maxLength={100} autoComplete="organization" disabled={busy} onChange={e => { setSenderName(e.target.value); changed(); }}/></Field>
        <Field label={t('emailSetupSenderAddress')} hint={t(provider === 'gmail' ? 'emailGmailAddressHint' : 'emailSetupSenderAddressHint')}><input type="email" value={senderEmail} maxLength={254} autoComplete="email" disabled={busy} onChange={e => { setSenderEmail(e.target.value); changed(); }}/></Field>
        {provider === 'gmail' && <Field label={t('emailGmailEndpoint')} hint={t('emailGmailEndpointHint')}><input type="url" value={endpoint} maxLength={300} autoComplete="off" spellCheck={false} autoCapitalize="none" disabled={busy} onChange={e => { setEndpoint(e.target.value); changed(); }}/></Field>}
        <Field label={t(provider === 'gmail' ? 'emailGmailCode' : 'emailSetupApiKey')} hint={t(storedKey ? 'emailSetupKeySaved' : provider === 'gmail' ? 'emailGmailCodeHint' : 'emailSetupKeyHint')}><input type={reveal ? 'text' : 'password'} value={apiKey} maxLength={203} autoComplete="off" spellCheck={false} autoCapitalize="none" disabled={busy} placeholder={t(storedKey ? 'emailSetupKeyPlaceholderSaved' : provider === 'gmail' ? 'emailGmailCodePlaceholder' : 'emailSetupKeyPlaceholder')} onChange={e => { setApiKey(e.target.value); changed(); }}/></Field>
        <button type="button" className="btn btn-ghost" disabled={busy || !apiKey} aria-pressed={reveal} onClick={() => setReveal(v => !v)}>{reveal ? <EyeOff size={16}/> : <Eye size={16}/>} {t(reveal ? 'emailSetupHideKey' : 'emailSetupShowKey')}</button>
        {provider === 'gmail' && <><div className="button-row"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setApiKey(newGmailConnectionKey()); setReveal(false); changed(); }}>{t('emailGmailGenerateCode')}</button><button type="button" className="btn btn-secondary" disabled={busy || !gmailScript || !validProviderCredential('gmail', apiKey.trim())} onClick={() => void copy('gmailScript', gmailScript.replace('__PRAXISRAUM_CONNECTION_KEY__', apiKey.trim()))}>{t(copied === 'gmailScript' ? 'emailSetupCopied' : 'emailGmailCopyScript')}</button><button type="button" className="btn btn-secondary" disabled={busy || !gmailScript || !validProviderCredential('gmail', apiKey.trim())} onClick={() => setShowScript(true)}>{t('emailGmailShowScript')}</button></div><p className="hint">{t('emailGmailCopyHint')}</p></>}
        <label className="check-label"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => { setEnabled(e.target.checked); changed(); }}/><span>{t('emailSetupEnabled')}</span></label>
        <p className="hint">{t('emailSetupStorageHint')}</p>
        <SaveButton status={save} disabled={!dirty || busy || !validEmail(senderEmail.trim()) || /[\x00-\x1f\x7f<>]/.test(senderName) || (!apiKey.trim() && !storedKey) || (!!apiKey.trim() && !validProviderCredential(provider, apiKey.trim())) || provider === 'gmail' && (!validGmailAddress(senderEmail.trim()) || !validGmailEndpoint(endpoint.trim()))}/>
      </form>}
      {status?.ready && <div id={`${wizardId}-test`} tabIndex={-1} className="email-setup-test"><h3>{t('emailSetupTestTitle')}</h3><p>{t('emailSetupTestHint').replace('{email}', status.accountEmail || '—')}</p><button type="button" className="btn btn-secondary" disabled={busy || dirty || !status.accountEmail } onClick={() => void test()}>{t(testing ? 'working' : proof ? 'emailWizardRepeatTest' : 'emailSetupSendTest')}</button>{dirty && <p className="hint">{t('emailSetupSaveFirst')}</p>}{proof && <label className="check-label"><input type="checkbox" checked={receiptPending ?? !!proof.confirmedAt} disabled={busy || dirty} onChange={e => void confirmReceipt(e.target.checked)}/><span>{t('emailWizardInboxConfirmed')}</span></label>}<p className="hint">{t('emailWizardLocalHint')}</p>{testedAt && <Notice>{t('emailSetupTestAccepted')} <time dateTime={testedAt}>{new Date(testedAt).toLocaleString(language === 'de' ? 'de-DE' : 'uk-UA')}</time></Notice>}</div>}
    </CloudAuth>}
    </div>
    {proofError && <Notice error>{t('emailWizardProofError')}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    {!demo && <details id={`${wizardId}-technical`} tabIndex={-1} className="email-setup-bootstrap" onToggle={e => { if (e.currentTarget.open && !migration) void import('../../supabase/email-settings.sql?raw').then(m => setMigration(m.default), () => setError('emailConnectionError')); }}><summary>{t('emailSetupBootstrapTitle')}</summary><p>{t('emailSetupBootstrapHint')}</p>
      <ol><li>{t('emailSetupBootstrapCloud')} <a className="text-link" href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">{t('emailSetupOpenSupabase')}</a></li>
        <li>{t('emailSetupBootstrapSql')}<button type="button" className="btn btn-secondary" disabled={!migration} onClick={() => void copy('sql', migration)}>{t(copied === 'sql' ? 'emailSetupCopied' : 'emailSetupCopySql')}</button><details><summary>{t('emailSetupShowSql')}</summary><pre tabIndex={0}>{migration || t('working')}</pre></details></li>
        <li>{t('emailSetupBootstrapFunction')}{user && /^[0-9a-f-]{36}$/i.test(user) && <><p className="hint">{t('emailSetupUserId')} <code>{user}</code></p><button type="button" className="btn btn-secondary" onClick={() => void copy('commands', `supabase secrets set APP_ORIGIN=${window.location.origin} EMAIL_OWNER_USER_ID=${user} MARKETING_OWNER_USER_ID=${user}\nsupabase functions deploy send-client-email --no-verify-jwt\nsupabase functions deploy send-marketing --no-verify-jwt`)}>{t(copied === 'commands' ? 'emailSetupCopied' : 'emailSetupCopyCommands')}</button></>}</li></ol>
      <p className="hint">{t('emailSetupBootstrapSecurity')}</p></details>}
    <p className="hint">{t('emailSetupPrivacy')}</p>
    {showScript && validProviderCredential('gmail', apiKey.trim()) && <Modal title={t('emailGmailShowScript')} onClose={() => setShowScript(false)}><p>{t('emailGmailManualCopy')}</p><Field label={t('emailGmailScriptText')}><textarea rows={12} readOnly spellCheck={false} value={gmailScript.replace('__PRAXISRAUM_CONNECTION_KEY__', apiKey.trim())}/></Field><p className="hint">{t('emailGmailCopyHint')}</p><div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setShowScript(false)}>{t('close')}</button></div></Modal>}
  </section>;
}
