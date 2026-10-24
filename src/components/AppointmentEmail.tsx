import { useEffect, useRef, useState } from 'react';
import { registerBeforeLock } from '../lib/autoLock';
import { emailConfigured } from '../lib/documents';
import { dispatchAppointmentEmail, prepareAppointmentEmail, emailReminderDue, type AppointmentEmailPurpose } from '../lib/appointmentEmail';
import type { Appointment, AppointmentEmailDelivery } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { useI18n, type TextKey } from '../lib/i18n';
import { Field, Modal, Notice } from './ui';
import { EmailSetupButton } from './EmailSetupCard';
export function AppointmentEmail({ vault, appointment, onClose }: { vault: VaultController; appointment: Appointment; onClose: () => void }) {
  const { t, language } = useI18n(); const [purpose,setPurpose] = useState<AppointmentEmailPurpose>('appointmentConfirmation');
  const [preview,setPreview] = useState<AppointmentEmailDelivery>(), [error,setError] = useState<TextKey>(), [busy,setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const current = vault.data!.appointments.find(a => a.id === appointment.id) ?? appointment;
  useEffect(() => { const current = new AbortController(); controller.current = current; const unregister = registerBeforeLock(async () => { current.abort(); }); return () => { current.abort(); unregister(); }; },[]);
  useEffect(() => { let active = true; setPreview(undefined); setError(undefined); void prepareAppointmentEmail(vault.data!,appointment.id,purpose).then(v => { if(active)setPreview(v); },() => { if(active)setError('appointmentEmailConsentMissing'); }); return () => {active=false;}; },[vault.generation,appointment.id,purpose]);
  const send = async () => {
    setBusy(true); setError(undefined);
    try { await dispatchAppointmentEmail(vault,appointment.id,purpose,{ signal:controller.current!.signal }); }
    catch (err) { if(!controller.current!.signal.aborted) { const code = (err as Error).message; setError(['emailNotConfigured','emailSetupRequired','emailProviderKeyInvalid','emailSenderNotVerified','authError','emailRetryExpired','appointmentEmailConsentMissing','emailRateLimited','appointmentEmailUnknown'].includes(code) ? code as TextKey : 'emailSendError'); } }
    finally { if(!controller.current!.signal.aborted)setBusy(false); }
  };
  return <Modal title={t('appointmentEmailTitle')} onClose={() => { if(!busy)onClose(); }}><Field label={t('appointmentEmailType')}><select value={purpose} disabled={busy} onChange={e => setPurpose(e.target.value as AppointmentEmailPurpose)}><option value="appointmentConfirmation">{t('appointmentConfirmation')}</option><option value="appointmentReminder">{t('appointmentReminder')}</option></select></Field>
    <p className="hint">{t('appointmentEmailPrivacy')}</p>{!emailConfigured && <Notice>{t('emailNotConfigured')}</Notice>}
    <EmailSetupButton demo={vault.demo}/>
    {preview && <div className="email-preview" lang={vault.data!.clients.find(c => c.id === current.clientId)?.language}><p><strong>{preview.recipient}</strong></p><h3>{preview.subject}</h3><p className="whitespace-pre-wrap">{preview.body}</p><p className="hint">{t('appointmentEmailCalendar')}</p>{preview.acceptedAt && <Notice>{t('documentSentOn')} {new Date(preview.acceptedAt).toLocaleString(language === 'de' ? 'de-DE':'uk-UA')}</Notice>}{!preview.acceptedAt && current.emailDeliveries?.some(d=>d.id===preview.id) && <Notice error>{t('appointmentEmailUnknown')}</Notice>}</div>}
    {error && <Notice error>{t(error)}</Notice>}
    {(current.emailDeliveries?.length ?? 0) > 0 && <details><summary>{t('appointmentEmailHistory')}</summary><ul>{[...current.emailDeliveries!].sort((a,b)=>b.requestedAt.localeCompare(a.requestedAt)).slice(0,20).map(d=><li key={d.id}>{t(d.purpose)} · {new Date(d.acceptedAt ?? d.requestedAt).toLocaleString(language === 'de' ? 'de-DE':'uk-UA')} · {t(d.acceptedAt ? 'appointmentEmailAccepted':'appointmentEmailUnknownShort')}</li>)}</ul></details>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button><button type="button" className="btn btn-primary" disabled={vault.demo || busy || !preview || !!preview.acceptedAt || !emailConfigured || purpose === 'appointmentReminder' && !emailReminderDue(current)} onClick={() => void send()}>{t(busy ? 'working':'appointmentEmailSend')}</button></div>
  </Modal>;
}
