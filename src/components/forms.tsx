import { DictationButton } from './DictationButton';
import { conflictsWithAbsence } from '../lib/availability';
import { isSessionVoided } from '../lib/invoice';
import { useEffect, useState, type FormEvent } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { uid, type Appointment, type Client, type Currency, type ExchangeRate, type Session } from '../lib/types';
import { addDays, addMonths, appointmentInstant, clientZone, dateLabel, daysBetween, parseMoney, tagsFrom, today } from '../lib/dates';
import { ZoneSelect } from './ZoneSelect';
import { isValidZone, utcOffset, zonePlace } from '../lib/zones';
import { FeeInput } from './money';
import { billAmount, convertWhole, currencyOf } from '../lib/currency';
import { DualTimeBox } from './DualTime';
import { deleteClient, deleteSession, feeText, findConflict, suggestedFee } from '../lib/records';
import { pendingHomework } from '../lib/discussion';
import { referencedBlobs } from '../lib/blobs';
import { useTemplates, withTemplate } from '../lib/templates';
import { compressImage } from '../lib/images';
import type { VaultController } from '../lib/useVault';
import { Avatar, Field, Modal, Notice } from './ui';
function Actions({ busy, onClose, label, onDelete, deleteLabel }: { busy: boolean; onClose: () => void; label?: string; onDelete?: () => void; deleteLabel?: string }) {
  const { t } = useI18n();
  return <div className="form-actions">{onDelete && <button type="button" className="btn btn-danger" disabled={busy} onClick={onDelete}><Trash2 size={16}/>{deleteLabel || t('delete')}</button>}<button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {busy ? t('working') : label || t('save')}</button></div>;
}
export function ClientForm({ vault, client, onClose, onSaved, onDeleted }: { vault: VaultController; client?: Client; onClose: () => void; onSaved: (id: string) => void; onDeleted?: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(client?.name || '');
  const [contact, setContact] = useState(client?.contact || '');
  const [email, setEmail] = useState(client?.email || '');
  const [ukrainian, setUkrainian] = useState(client?.language === 'uk');
  const [currency, setCurrency] = useState<Currency>(currencyOf(client));
  const [currencyTouched, setCurrencyTouched] = useState(!!client);
  const [chat, setChat] = useState(client?.telegramChatId || '');
  const [consent, setConsent] = useState(client?.reminderConsent || false);
  const [address, setAddress] = useState(client?.address || '');
  const [zone, setZone] = useState(client?.timeZone || vault.data!.settings.timeZone);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey>();
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!name.trim() || (chat && !/^-?\d+$/.test(chat)) || !isValidZone(zone)) { setError('required'); return; }
    if (email.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim())) { setError('invalidClientEmail'); return; }
    setBusy(true);
    try {
      const avatarId = file ? await vault.addImage(await compressImage(file, true)) : client?.avatarId;
      const result: Client = { id: client?.id || uid(), name: name.trim(), contact: contact.trim(), email: email.trim(), createdAt: client?.createdAt || today(), preparation: client?.preparation || '', language: ukrainian ? 'uk' : 'de', telegramChatId: chat.trim(), reminderConsent: consent, avatarId, address: address.trim(), timeZone: zone, currency };
      const before = referencedBlobs(vault.data!);
      await vault.update(data => { const index = data.clients.findIndex(c => c.id === result.id); if (index < 0) data.clients.push(result); else data.clients[index] = result; });
      await vault.purgeUnused(before); // a replaced profile picture must not linger encrypted on the device or in the cloud
      onSaved(result.id);
    } catch (err) { setError(err instanceof Error && err.message === 'invalidImage' ? 'invalidImage' : 'storageError'); } finally { setBusy(false); }
  }
  async function removeClient() {
    if (!client || !window.confirm(`${client.name}\n\n${t('deleteClientConfirm')}${vault.data!.invoices.some(i => i.clientId === client.id) ? `\n\n${t('deleteClientInvoicesNote')}` : ''}`)) return;
    setBusy(true);
    try { await vault.remove(data => deleteClient(data, client.id), true); onDeleted?.(); } catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t(client ? 'editClient' : 'newClient')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <div className="avatar-upload">{preview ? <img className="avatar avatar-large" src={preview} alt={t('avatar')}/> : client ? <Avatar client={client} vault={vault} large/> : <span className="avatar avatar-large"><Camera size={26}/></span>}<div><label className="btn btn-secondary file-label"><Camera size={17}/>{t(client ? 'changeAvatar' : 'addAvatar')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { setFile(e.target.files?.[0]); e.target.value = ''; }}/></label><small>{t('avatarHint')}</small></div></div>
    <Field label={`${t('name')} *`}><input autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder={t('namePlaceholder')} autoComplete="off" required/></Field>
    <Field label={t('contact')}><input value={contact} maxLength={160} onChange={e => setContact(e.target.value)} placeholder={t('contactPlaceholder')}/></Field>
    <Field label={t('clientEmail')} hint={t('clientEmailHint')}><input type="email" autoComplete="off" inputMode="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder={t('clientEmailPlaceholder')}/></Field>
    <Field label={t('clientAddress')}><textarea rows={2} value={address} maxLength={400} onChange={e => setAddress(e.target.value)}/></Field>
    <ZoneSelect label={t('clientTimeZone')} hint={t('clientTimeZoneHint')} value={zone} onChange={setZone}/>
    <div className="form-section"><h3>{t('clientLanguage')}</h3><label className="check-label"><input type="checkbox" checked={ukrainian} onChange={e => { setUkrainian(e.target.checked); if (!currencyTouched) setCurrency(e.target.checked ? 'UAH' : 'EUR'); }}/><span>{t('ukrainianReminders')}</span></label><p className="hint">{t('languageHelp')}</p></div>
    <Field label={t('billingCurrency')} hint={t('billingCurrencyHint')}><select value={currency} onChange={e => { setCurrency(e.target.value as Currency); setCurrencyTouched(true); }}><option value="EUR">{t('currencyEur')}</option><option value="UAH">{t('currencyUah')}</option></select></Field>
    <Field label={t('telegramChatId')} hint={t('chatHelp')}><input value={chat} maxLength={24} inputMode="numeric" onChange={e => setChat(e.target.value)} placeholder={t('chatPlaceholder')}/></Field>
    <label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{t('reminderConsent')}</span></label>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose} onDelete={client && onDeleted ? () => void removeClient() : undefined} deleteLabel={t('deleteClient')}/>
  </form></Modal>;
}
export function AppointmentForm({ vault, clientId, appointment, onClose }: { vault: VaultController; clientId?: string; appointment?: Appointment; onClose: () => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const practiceZone = data.settings.timeZone;
  const [selected, setSelected] = useState(appointment?.clientId || clientId || data.clients[0]?.id || '');
  const [date, setDate] = useState(appointment?.date || today()); const [time, setTime] = useState(appointment?.time || '10:00');
  const initialNative = currencyOf(data.clients.find(c => c.id === selected)) === 'UAH' && appointment?.billing?.currency === 'UAH';
  const [duration, setDuration] = useState(String(appointment?.duration ?? 50)); const [fee, setFee] = useState(feeText(initialNative ? appointment!.billing!.amountCents : appointment?.feeCents ?? suggestedFee(data, selected)));
  const [inputCurrency, setInputCurrency] = useState<Currency>(initialNative ? 'UAH' : 'EUR');
  const [rate, setRate] = useState<ExchangeRate | undefined>(appointment?.billing?.rate ?? data.settings.exchangeRate);
  const [pricingChanged, setPricingChanged] = useState(false);
  const [zone, setZone] = useState(appointment?.timeZone ?? practiceZone);
  const savedClient = data.clients.find(c => c.id === selected);
  const [theirZoneChoice, setTheirZoneChoice] = useState(clientZone(savedClient, data.settings));
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none'); const [count, setCount] = useState('8');
  const [following, setFollowing] = useState(false);
  const [feeTouched, setFeeTouched] = useState(!!appointment);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  const length = Number(duration); const client = data.clients.find(c => c.id === selected); const theirZone = isValidZone(theirZoneChoice) ? theirZoneChoice : clientZone(client, data.settings);
  const zones = [...new Set([practiceZone, theirZone])]; const entryZone = zones.includes(zone) ? zone : practiceZone;
  const candidate = { id: appointment?.id ?? '', date, time, duration: length, timeZone: entryZone };
  const repeats = !appointment && repeat !== 'none' ? Math.min(52, Math.max(2, Math.floor(Number(count)) || 2)) : 1;
  const dates = Array.from({ length: repeats }, (_, i) => repeat === 'monthly' ? addMonths(date, i) : addDays(date, i * (repeat === 'biweekly' ? 14 : 7)));
  let instantNow = ''; let clashes: Appointment[] = [];
  try {
    if (date && /^\d\d:\d\d$/.test(time)) {
      instantNow = appointmentInstant({ date, time, timeZone: entryZone });
      if (Number.isInteger(length) && length > 0) clashes = dates.map(d => findConflict(data.appointments, { ...candidate, date: d })).filter((c): c is Appointment => !!c);
    }
  } catch { /* an incomplete date or time simply shows no preview */ }
  function choose(id: string) { if (inputCurrency === 'UAH') { try { setFee(feeText(convertWhole(parseMoney(fee), 'UAH', 'EUR', rate))); } catch { setFee(feeText(suggestedFee(data, id))); } } setInputCurrency('EUR'); setPricingChanged(true); setSelected(id); setTheirZoneChoice(clientZone(data.clients.find(c => c.id === id), data.settings)); setZone(practiceZone); if (!feeTouched && id) setFee(feeText(suggestedFee(data, id))); }
  const absenceConflicts = data.availability.filter(block => dates.some(day => conflictsWithAbsence({ ...candidate, date: day, status: 'scheduled' }, block)));
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!selected || !date || !time || !isValidZone(theirZoneChoice) || !Number.isInteger(length) || length < 5 || length > 480) { setError('required'); return; }
    setBusy(true);
    try {
      const pricing = !pricingChanged && appointment?.billing && appointment.clientId === selected && appointment.billing.currency === currencyOf(client) ? { feeCents: appointment.feeCents, billing: appointment.billing } : billAmount(parseMoney(fee), inputCurrency, currencyOf(client), rate);
      const { feeCents, billing } = pricing;
      appointmentInstant({ date, time, timeZone: entryZone });
      if (appointment) {
        // A rescheduled appointment gets a fresh reminder so an already delivered one cannot suppress the new date.
        const shift = daysBetween(appointment.date, date);
        const edit = (a: Appointment, newDate: string): Appointment => { const moved = a.date !== newDate || a.time !== time || a.timeZone !== entryZone; return { ...a, clientId: selected, date: newDate, time, duration: length, feeCents, billing, timeZone: entryZone, reminderId: moved ? uid() : a.reminderId }; };
        const start = Date.parse(appointmentInstant(appointment));
        await vault.update(d => {
          const owner = d.clients.find(c => c.id === selected); if (owner && clientZone(owner, d.settings) !== theirZone) owner.timeZone = theirZone; // remember where the client lives
          if (billing.rate) d.settings.exchangeRate = billing.rate;
          d.appointments = d.appointments.map(a => a.id === appointment.id ? edit(a, date)
            : following && appointment.seriesId && a.seriesId === appointment.seriesId && a.status === 'scheduled' && Date.parse(appointmentInstant(a)) > start ? edit(a, addDays(a.date, shift)) : a);
        });
      } else {
        const seriesId = repeats > 1 ? uid() : undefined;
        const created = dates.map((d): Appointment => ({ id: uid(), clientId: selected, date: d, time, duration: length, feeCents, billing, timeZone: entryZone, reminderId: uid(), status: 'scheduled', ...seriesId && { seriesId } }));
        await vault.update(d => { d.appointments.push(...created); if (billing.rate) d.settings.exchangeRate = billing.rate; const owner = d.clients.find(c => c.id === selected); if (owner && clientZone(owner, d.settings) !== theirZone) owner.timeZone = theirZone; });
      }
      onClose();
    } catch (err) { setError(err instanceof Error && ['invalidAmount', 'rateRequired'].includes(err.message) ? err.message as TextKey : 'required'); } finally { setBusy(false); }
  }
  return <Modal title={t(appointment ? 'editAppointment' : 'newAppointment')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={`${t('client')} *`}><select value={selected} onChange={e => choose(e.target.value)} required><option value="">{t('chooseClient')}</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="form-grid"><Field label={`${t('date')} *`}><input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field><Field label={`${t('time')} *`}><input type="time" value={time} onChange={e => setTime(e.target.value)} required/></Field></div>
    {selected && <ZoneSelect label={t('clientTimeZone')} hint={t('clientTimeZoneHint')} value={theirZoneChoice} onChange={setTheirZoneChoice}/>}
    {client?.language === 'uk' && theirZone === practiceZone && <p className="hint">{t('suggestKyivHint')} <button type="button" className="text-link inline" onClick={() => setTheirZoneChoice('Europe/Kyiv')}>{t('suggestKyivButton')}</button></p>}
    {zones.length > 1 && <Field label={t('timeEnteredIn')}><select value={entryZone} onChange={e => setZone(e.target.value)}>{zones.map(z => <option key={z} value={z}>{t(z === practiceZone ? 'zonePractice' : 'zoneClient')} · {zoneLabel(z, language)}</option>)}</select></Field>}
    {absenceConflicts.length > 0 && <Notice error>{t('availabilityAppointmentConflict')} {absenceConflicts.map(a => a.title || t(a.kind === 'vacation' ? 'availabilityVacation' : 'availabilityAway')).join(' · ')}</Notice>}
    {instantNow && <DualTimeBox instant={instantNow} practiceZone={practiceZone} clientZone={theirZone}/>}
    <Field label={t('duration')}><input type="number" min="5" max="480" value={duration} onChange={e => setDuration(e.target.value)}/></Field><FeeInput value={fee} onChange={value => { setFee(value); setFeeTouched(true); setPricingChanged(true); }} inputCurrency={inputCurrency} onCurrency={value => { setInputCurrency(value); setPricingChanged(true); }} currency={currencyOf(client)} rate={rate} onRate={value => { setRate(value); setPricingChanged(true); }} auto={!appointment?.billing}/>
    {!appointment && <div className="form-grid"><Field label={t('repeat')}><select value={repeat} onChange={e => setRepeat(e.target.value as typeof repeat)}>{(['none', 'weekly', 'biweekly', 'monthly'] as const).map(r => <option key={r} value={r}>{t(`repeat${r[0].toUpperCase()}${r.slice(1)}` as TextKey)}</option>)}</select></Field>{repeat !== 'none' && <Field label={t('repeatCount')}><input type="number" min="2" max="52" value={count} onChange={e => setCount(e.target.value)}/></Field>}</div>}
    {appointment?.seriesId && <label className="check-label"><input type="checkbox" checked={following} onChange={e => setFollowing(e.target.checked)}/><span>{t('changeFollowing')}</span></label>}
    {clashes.length > 0 && <Notice error>{repeats > 1 ? `${t('seriesConflicts')} ${clashes.length}` : t('conflictWarning')} {clashes.slice(0, 3).map(c => `${data.clients.find(x => x.id === c.clientId)?.name} · ${c.date} ${c.time}`).join('; ')}</Notice>}
    <Notice>{t('appointmentHint')}</Notice>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose}/>
  </form></Modal>;
}
const zoneLabel = (zone: string, language: 'de' | 'uk') => `${zonePlace(zone, language)} (${utcOffset(zone, Date.now())})`;
export function SessionForm({ vault, clientId, appointment, session, onClose }: { vault: VaultController; clientId?: string; appointment?: Appointment; session?: Session; onClose: () => void }) {
  const { t, language } = useI18n(); const data = vault.data!;
  const [selected, setSelected] = useState(session?.clientId || appointment?.clientId || clientId || data.clients[0]?.id || '');
  const [date, setDate] = useState(session?.date || appointment?.date || today()); const [time, setTime] = useState(session?.time || appointment?.time || '10:00');
  const lockedPricing = !!session?.invoiceId && !isSessionVoided(data, session);
  const originalBilling = session?.billing ?? appointment?.billing;
  const initialNative = currencyOf(data.clients.find(c => c.id === selected)) === 'UAH' && originalBilling?.currency === 'UAH';
  const [fee, setFee] = useState(feeText(initialNative ? originalBilling!.amountCents : session?.feeCents ?? appointment?.feeCents ?? suggestedFee(data, selected)));
  const [feeTouched, setFeeTouched] = useState(!!(session || appointment));
  const [inputCurrency, setInputCurrency] = useState<Currency>(initialNative ? 'UAH' : 'EUR');
  const [rate, setRate] = useState<ExchangeRate | undefined>(originalBilling?.rate ?? data.settings.exchangeRate);
  const [pricingChanged, setPricingChanged] = useState(false);
  const [paid, setPaid] = useState(!!session?.paidAt); const [paymentDate, setPaymentDate] = useState(session?.paidAt || today());
  const templates = useTemplates(data); const [notes, setNotes] = useState(session?.notes || ''); const [tags, setTags] = useState(session?.tags.map(tag => `#${tag}`).join(', ') || '');
  const [homework, setHomework] = useState(session?.homework || ''); const [homeworkDone, setHomeworkDone] = useState(!!session?.homeworkDone);
  const client = data.clients.find(c => c.id === selected);
  const [nextTopics, setNextTopics] = useState(client?.preparation ?? ''); const [nextTouched, setNextTouched] = useState(false);
  const [files, setFiles] = useState<File[]>([]); const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [reviewPrevious, setReviewPrevious] = useState(false);
  const previous = selected ? pendingHomework(data, selected, session?.id) : undefined;
  const attached = session ? data.notes.filter(n => n.sessionId === session.id && !removedPhotos.includes(n.id)) : [];
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  function choose(id: string) { if (inputCurrency === 'UAH') { try { setFee(feeText(convertWhole(parseMoney(fee), 'UAH', 'EUR', rate))); } catch { setFee(feeText(suggestedFee(data, id))); } } setInputCurrency('EUR'); setPricingChanged(true); setSelected(id); setReviewPrevious(false); if (!feeTouched && id) setFee(feeText(suggestedFee(data, id))); if (!nextTouched) setNextTopics(data.clients.find(c => c.id === id)?.preparation ?? ''); }
  // Copy the files out at once: the input's FileList is emptied as soon as its value is reset.
  const addFiles = (list: FileList | null) => { const picked = Array.from(list ?? []); if (picked.length) setFiles(current => [...current, ...picked].slice(0, 12)); };
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!selected || !date || !time || (paid && (!paymentDate || paymentDate > today()))) { setError('required'); return; }
    setBusy(true);
    const before = referencedBlobs(data); const added: string[] = [];
    try {
      const text = homework.trim();
      const pricing = lockedPricing && session ? { feeCents: session.feeCents, billing: session.billing ?? { currency: 'EUR' as const, amountCents: session.feeCents } } : !pricingChanged && originalBilling && (session?.clientId ?? appointment?.clientId) === selected && originalBilling.currency === currencyOf(client)
        ? { feeCents: session?.feeCents ?? appointment!.feeCents, billing: originalBilling } : billAmount(parseMoney(fee), inputCurrency, currencyOf(client), rate);
      const originalFeeCents = session?.originalFeeCents ?? appointment?.originalFeeCents;
      const result: Session = { id: session?.id ?? uid(), clientId: selected, date, time, ...pricing, paidAt: paid ? paymentDate : null, notes: notes.trim(), tags: tagsFrom(tags), appointmentId: session?.appointmentId ?? appointment?.id,
        ...(originalFeeCents !== undefined && { originalFeeCents }),
        ...session?.invoiceId && { invoiceId: session.invoiceId }, ...text && { homework: text, homeworkDone } };
      for (const file of files) added.push(await vault.addImage(await compressImage(file)));
      await vault.update(d => {
        if (pricing.billing.rate) d.settings.exchangeRate = pricing.billing.rate;
        if (session) { const index = d.sessions.findIndex(s => s.id === session.id); if (index < 0) return; d.sessions[index] = result; }
        else {
          if (appointment && d.sessions.some(s => s.appointmentId === appointment.id)) return;
          d.sessions.push(result);
          if (appointment) d.appointments.find(a => a.id === appointment.id)!.status = 'completed';
        }
        d.notes = d.notes.filter(n => !removedPhotos.includes(n.id));
        for (const blobId of added) d.notes.push({ id: uid(), clientId: selected, blobId, sessionId: result.id, caption: '', tags: result.tags, createdAt: new Date().toISOString() });
        if (reviewPrevious && previous) { const earlier = d.sessions.find(s => s.id === previous.id); if (earlier) earlier.homeworkDone = true; }
        const owner = d.clients.find(c => c.id === selected); if (owner && nextTouched && owner.preparation !== nextTopics) owner.preparation = nextTopics;
      });
      await vault.purgeUnused([...before, ...added]); onClose();
    } catch (err) { setError(err instanceof Error && ['invalidAmount', 'rateRequired'].includes(err.message) ? err.message as TextKey : err instanceof Error && err.message === 'invalidImage' ? 'invalidImage' : 'storageError'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!session || !window.confirm(`${t('deleteSessionConfirm')}${session.invoiceId ? `\n\n${t('deleteInvoicedSessionNote')}` : ''}${data.notes.some(n => n.sessionId === session.id) ? `\n\n${t('deleteSessionPhotosNote')}` : ''}`)) return;
    setBusy(true);
    try { await vault.remove(d => deleteSession(d, session.id)); onClose(); } catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t(session ? 'editSession' : 'addSession')} onClose={() => { if (!busy) onClose(); }} wide><form onSubmit={submit} noValidate>
    <Field label={t('client')}><select value={selected} disabled={!!appointment || lockedPricing} onChange={e => choose(e.target.value)}><option value="">{t('chooseClient')}</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="form-grid"><Field label={t('date')}><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field><Field label={t('time')}><input type="time" value={time} onChange={e => setTime(e.target.value)}/></Field></div>
    <div className="form-section"><h3>{t('discussedTitle')}</h3>
      <Field label={t('insertTemplate')}><select value="" onChange={e => { const chosen = templates.find(x => x.id === e.target.value); if (chosen) setNotes(withTemplate(notes, chosen.body)); }}><option value="">—</option>{templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <DictationButton value={notes} onChange={setNotes}/><Field label={t('sessionNotes')}><textarea rows={4} value={notes} maxLength={20000} placeholder={t('sessionDiscussedPlaceholder')} onChange={e => setNotes(e.target.value)}/></Field>
      <div className="photo-pick" role="group" aria-label={t('handwritten')}><span className="photo-pick-label">{t('handwritten')}</span>
        <label className="btn btn-secondary file-label"><Camera size={16}/>{t('photoTake')}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/></label>
        <label className="btn btn-secondary file-label"><ImagePlus size={16}/>{t('photoChoose')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/></label></div>
      {(files.length > 0 || attached.length > 0) && <ul className="photo-list" aria-label={t('photosAttached')}>
        {attached.map(n => <li key={n.id}><span><ImagePlus size={14}/> {t('photoNote')}</span><button type="button" className="icon-btn danger" aria-label={t('photoRemove')} title={t('photoRemove')} onClick={() => setRemovedPhotos([...removedPhotos, n.id])}><Trash2 size={15}/></button></li>)}
        {files.map((f, i) => <li key={`${f.name}${i}`}><span><ImagePlus size={14}/> {f.name}</span><button type="button" className="icon-btn danger" aria-label={`${t('photoRemove')}: ${f.name}`} title={t('photoRemove')} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Trash2 size={15}/></button></li>)}</ul>}
      <Field label={t('tags')} hint={t('tagsHelp')}><input value={tags} maxLength={500} placeholder={t('tagsPlaceholder')} onChange={e => setTags(e.target.value)}/></Field></div>
    <div className="form-section"><h3>{t('homework')}</h3>
      {previous && <div className="previous-homework"><strong>{t('homeworkPrevious')} · {dateLabel(previous.date, language, { day: 'numeric', month: 'short' })}</strong><p className="pre-line">{previous.homework}</p><label className="check-label"><input type="checkbox" checked={reviewPrevious} onChange={e => setReviewPrevious(e.target.checked)}/><span>{t('homeworkReviewed')}</span></label></div>}
      <DictationButton value={homework} onChange={setHomework} maxLength={4000}/><Field label={t('homeworkFor')}><textarea rows={3} value={homework} maxLength={4000} placeholder={t('homeworkPlaceholder')} onChange={e => setHomework(e.target.value)}/></Field>
      {session && homework.trim() && <label className="check-label"><input type="checkbox" checked={homeworkDone} onChange={e => setHomeworkDone(e.target.checked)}/><span>{t('homeworkReviewed')}</span></label>}
      <Field label={t('nextTopicsField')} hint={t('nextTopicsHint')}><textarea rows={3} value={nextTopics} maxLength={30000} onChange={e => { setNextTopics(e.target.value); setNextTouched(true); }}/></Field></div>
    <div className="form-section">{lockedPricing ? <Notice>{t('invoiceSessionPricingLocked')}</Notice> : <FeeInput value={fee} onChange={value => { setFee(value); setFeeTouched(true); setPricingChanged(true); }} inputCurrency={inputCurrency} onCurrency={value => { setInputCurrency(value); setPricingChanged(true); }} currency={currencyOf(client)} rate={rate} onRate={value => { setRate(value); setPricingChanged(true); }} auto={!originalBilling}/>}
      <label className="check-label"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)}/><span>{t('paid')}</span></label>
      {paid && <Field label={t('paymentDate')} hint={t('paymentDateHint')}><input type="date" value={paymentDate} max={today()} onChange={e => setPaymentDate(e.target.value)}/></Field>}</div>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose} onDelete={session ? () => void remove() : undefined} deleteLabel={t('deleteSession')}/>
  </form></Modal>;
}
export function NoteForm({ vault, clientId, onClose }: { vault: VaultController; clientId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File>(); const [caption, setCaption] = useState(''); const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!file) { setError('required'); return; }
    setBusy(true); setError(undefined);
    try {
      const blobId = await vault.addImage(await compressImage(file));
      await vault.update(data => { data.notes.push({ id: uid(), blobId, clientId, caption: caption.trim(), tags: tagsFrom(tags), createdAt: new Date().toISOString() }); }); onClose();
    } catch (err) { setError(err instanceof Error && err.message === 'invalidImage' ? 'invalidImage' : 'storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t('addNote')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <label className="dropzone"><ImagePlus size={32}/><strong>{file?.name || t('choosePhoto')}</strong><span>{t('photoHelp')}</span><input aria-label={t('photo')} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0])}/></label>
    <Field label={t('caption')}><input value={caption} maxLength={500} placeholder={t('captionPlaceholder')} onChange={e => setCaption(e.target.value)}/></Field>
    <Field label={t('tags')} hint={t('tagsHelp')}><input value={tags} maxLength={500} placeholder={t('tagsPlaceholder')} onChange={e => setTags(e.target.value)}/></Field>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose}/>
  </form></Modal>;
}
export function PaymentForm({ vault, session, onClose }: { vault: VaultController; session: Session; onClose: () => void }) {
  const { t } = useI18n(); const [date, setDate] = useState(today()); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  return <Modal title={t('paymentInfo')} onClose={onClose}><form onSubmit={async e => {
    e.preventDefault(); if (!date || date > today()) { setError(true); return; } setBusy(true);
    try { await vault.update(d => { d.sessions.find(s => s.id === session.id)!.paidAt = date; }); onClose(); } catch { setError(true); } finally { setBusy(false); }
  }} noValidate><Field label={t('paymentDate')} hint={t('paymentDateHint')}><input type="date" max={today()} value={date} onChange={e => setDate(e.target.value)}/></Field>{error && <Notice error>{t('required')}</Notice>}<Actions busy={busy} onClose={onClose} label={t('paymentSave')}/></form></Modal>;
}
