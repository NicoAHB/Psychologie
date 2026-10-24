import { useState } from 'react';
import { cancellationDefault, recordAppointmentFailure, type FailureStatus } from '../lib/cancellations';
import { billAmount } from '../lib/currency';
import { parseMoney } from '../lib/dates';
import { feeText } from '../lib/records';
import { useI18n, type TextKey } from '../lib/i18n';
import type { Appointment } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { FeeInput } from './money';
import { Field, Modal, Notice } from './ui';
export function AppointmentFailure({ vault, appointment, onClose }: { vault: VaultController; appointment: Appointment; onClose: () => void }) {
  const { t } = useI18n(); const defaults = cancellationDefault(vault.data!, appointment);
  const [status, setStatus] = useState<FailureStatus>('noShow'), [withFee, setWithFee] = useState(defaults.value > 0);
  const [fee, setFee] = useState(feeText(defaults.value)), [inputCurrency, setInputCurrency] = useState(defaults.inputCurrency), [rate, setRate] = useState(defaults.rate);
  const [busy, setBusy] = useState(false), [error, setError] = useState<TextKey>();
  return <Modal title={t('appointmentFailure')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(undefined); try { const pricing = withFee ? billAmount(parseMoney(fee), inputCurrency, defaults.currency, rate) : undefined; await vault.update(d => recordAppointmentFailure(d, appointment.id, status, pricing)); onClose(); } catch (err) { const message = (err as Error).message; setError(['rateRequired','invalidAmount','quickPaymentDraft','quickPaymentUnavailable'].includes(message) ? message as TextKey : 'storageError'); } finally { setBusy(false); } }}>
    <p>{vault.data!.clients.find(c => c.id === appointment.clientId)?.name} · {appointment.date} · {appointment.time}</p>
    <Field label={t('appointmentOutcome')}><select value={status} onChange={e => setStatus(e.target.value as FailureStatus)}><option value="noShow">{t('noShow')}</option><option value="lateCancelled">{t('lateCancelled')}</option></select></Field>
    <label className="check-label"><input type="checkbox" checked={withFee} onChange={e => setWithFee(e.target.checked)}/><span>{t('chargeCancellationFee')}</span></label>
    {withFee && <FeeInput allowForeignInput value={fee} onChange={setFee} inputCurrency={inputCurrency} onCurrency={setInputCurrency} currency={defaults.currency} rate={rate} onRate={setRate} auto={false}/>}
    <p className="hint">{t('cancellationFeeHint')}</p>{error && <Notice error>{t(error)}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t(busy ? 'working' : 'save')}</button></div>
  </form></Modal>;
}
