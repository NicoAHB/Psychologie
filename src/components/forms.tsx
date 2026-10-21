import { useEffect, useState, type FormEvent } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { uid, type Appointment, type Client, type Session } from '../lib/types';
import { addDays, addMonths, appointmentInstant, clientZone, daysBetween, parseMoney, tagsFrom, today } from '../lib/dates';
import { ZoneSelect } from './ZoneSelect';
import { isValidZone, placeTime, utcOffset, zoneCity } from '../lib/zones';
import { deleteClient, deleteSession, feeText, findConflict, suggestedFee } from '../lib/records';
import { referencedBlobs } from '../lib/blobs';
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
  const [ukrainian, setUkrainian] = useState(client?.language === 'uk');
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
    setBusy(true);
    try {
      const avatarId = file ? await vault.addImage(await compressImage(file, true)) : client?.avatarId;
      const result: Client = { id: client?.id || uid(), name: name.trim(), contact: contact.trim(), createdAt: client?.createdAt || today(), preparation: client?.preparation || '', language: ukrainian ? 'uk' : 'de', telegramChatId: chat.trim(), reminderConsent: consent, avatarId, address: address.trim(), timeZone: zone };
      const before = referencedBlobs(vault.data!);
      await vault.update(data => { const index = data.clients.findIndex(c => c.id === result.id); if (index < 0) data.clients.push(result); else data.clients[index] = result; });
      await vault.purgeUnused(before); // a replaced profile picture must not linger encrypted on the device or in the cloud
      onSaved(result.id);
    } catch (err) { setError(err instanceof Error && err.message === 'invalidImage' ? 'invalidImage' : 'storageError'); } finally { setBusy(false); }
  }
  async function removeClient() {
    if (!client || !window.confirm(`${client.name}\n\n${t('deleteClientConfirm')}`)) return;
    setBusy(true);
    try { await vault.remove(data => deleteClient(data, client.id)); onDeleted?.(); } catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t(client ? 'editClient' : 'newClient')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <div className="avatar-upload">{preview ? <img className="avatar avatar-large" src={preview} alt={t('avatar')}/> : client ? <Avatar client={client} vault={vault} large/> : <span className="avatar avatar-large"><Camera size={26}/></span>}<div><label className="btn btn-secondary file-label"><Camera size={17}/>{t(client ? 'changeAvatar' : 'addAvatar')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { setFile(e.target.files?.[0]); e.target.value = ''; }}/></label><small>{t('avatarHint')}</small></div></div>
    <Field label={`${t('name')} *`}><input autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder={t('namePlaceholder')} autoComplete="off" required/></Field>
    <Field label={t('contact')}><input value={contact} maxLength={160} onChange={e => setContact(e.target.value)} placeholder={t('contactPlaceholder')}/></Field>
    <Field label={t('clientAddress')}><textarea rows={2} value={address} maxLength={400} onChange={e => setAddress(e.target.value)}/></Field>
    <ZoneSelect label={t('clientTimeZone')} hint={t('clientTimeZoneHint')} value={zone} onChange={setZone}/>
    <div className="form-section"><h3>{t('clientLanguage')}</h3><label className="check-label"><input type="checkbox" checked={ukrainian} onChange={e => setUkrainian(e.target.checked)}/><span>{t('ukrainianReminders')}</span></label><p className="hint">{t('languageHelp')}</p></div>
    <Field label={t('telegramChatId')} hint={t('chatHelp')}><input value={chat} maxLength={24} inputMode="numeric" onChange={e => setChat(e.target.value)} placeholder={t('chatPlaceholder')}/></Field>
    <label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{t('reminderConsent')}</span></label>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose} onDelete={client && onDeleted ? () => void removeClient() : undefined} deleteLabel={t('deleteClient')}/>
  </form></Modal>;
}
export function AppointmentForm({ vault, clientId, appointment, onClose }: { vault: VaultController; clientId?: string; appointment?: Appointment; onClose: () => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const practiceZone = data.settings.timeZone;
  const [selected, setSelected] = useState(appointment?.clientId || clientId || data.clients[0]?.id || '');
  const [date, setDate] = useState(appointment?.date || today()); const [time, setTime] = useState(appointment?.time || '10:00');
  const [duration, setDuration] = useState(String(appointment?.duration ?? 50)); const [fee, setFee] = useState(feeText(appointment?.feeCents ?? suggestedFee(data, selected)));
  const [zone, setZone] = useState(appointment?.timeZone ?? practiceZone);
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none'); const [count, setCount] = useState('8');
  const [following, setFollowing] = useState(false);
  const [feeTouched, setFeeTouched] = useState(!!appointment);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  const length = Number(duration); const client = data.clients.find(c => c.id === selected); const theirZone = clientZone(client, data.settings);
  const zones = [...new Set([practiceZone, theirZone])]; const entryZone = zones.includes(zone) ? zone : practiceZone;
  const candidate = { id: appointment?.id ?? '', date, time, duration: length, timeZone: entryZone };
  const repeats = !appointment && repeat !== 'none' ? Math.min(52, Math.max(2, Math.floor(Number(count)) || 2)) : 1;
  const dates = Array.from({ length: repeats }, (_, i) => repeat === 'monthly' ? addMonths(date, i) : addDays(date, i * (repeat === 'biweekly' ? 14 : 7)));
  let preview = ''; let clashes: Appointment[] = [];
  try {
    if (date && /^\d\d:\d\d$/.test(time)) {
      const instant = appointmentInstant({ date, time, timeZone: entryZone });
      preview = zones.map(z => `${t(z === practiceZone ? 'practiceTime' : 'clientTime')}: ${placeTime(instant, z, language)}`).join(' · ');
      if (Number.isInteger(length) && length > 0) clashes = dates.map(d => findConflict(data.appointments, { ...candidate, date: d })).filter((c): c is Appointment => !!c);
    }
  } catch { /* an incomplete date or time simply shows no preview */ }
  function choose(id: string) { setSelected(id); if (!feeTouched && id) setFee(feeText(suggestedFee(data, id))); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!selected || !date || !time || !Number.isInteger(length) || length < 5 || length > 480) { setError('required'); return; }
    setBusy(true);
    try {
      const feeCents = parseMoney(fee);
      appointmentInstant({ date, time, timeZone: entryZone });
      if (appointment) {
        // A rescheduled appointment gets a fresh reminder so an already delivered one cannot suppress the new date.
        const shift = daysBetween(appointment.date, date);
        const edit = (a: Appointment, newDate: string): Appointment => { const moved = a.date !== newDate || a.time !== time || a.timeZone !== entryZone; return { ...a, clientId: selected, date: newDate, time, duration: length, feeCents, timeZone: entryZone, reminderId: moved ? uid() : a.reminderId }; };
        const start = Date.parse(appointmentInstant(appointment));
        await vault.update(d => {
          d.appointments = d.appointments.map(a => a.id === appointment.id ? edit(a, date)
            : following && appointment.seriesId && a.seriesId === appointment.seriesId && a.status === 'scheduled' && Date.parse(appointmentInstant(a)) > start ? edit(a, addDays(a.date, shift)) : a);
        });
      } else {
        const seriesId = repeats > 1 ? uid() : undefined;
        const created = dates.map((d): Appointment => ({ id: uid(), clientId: selected, date: d, time, duration: length, feeCents, timeZone: entryZone, reminderId: uid(), status: 'scheduled', ...seriesId && { seriesId } }));
        await vault.update(d => { d.appointments.push(...created); });
      }
      onClose();
    } catch (err) { setError(err instanceof Error && err.message === 'invalidAmount' ? 'invalidAmount' : 'required'); } finally { setBusy(false); }
  }
  return <Modal title={t(appointment ? 'editAppointment' : 'newAppointment')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={`${t('client')} *`}><select value={selected} onChange={e => choose(e.target.value)} required><option value="">{t('chooseClient')}</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="form-grid"><Field label={`${t('date')} *`}><input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field><Field label={`${t('time')} *`}><input type="time" value={time} onChange={e => setTime(e.target.value)} required/></Field></div>
    {zones.length > 1 && <Field label={t('timeEnteredIn')}><select value={entryZone} onChange={e => setZone(e.target.value)}>{zones.map(z => <option key={z} value={z}>{t(z === practiceZone ? 'zonePractice' : 'zoneClient')} · {zoneLabel(z, language)}</option>)}</select></Field>}
    {preview && <p className="zone-preview" aria-live="polite">{preview}</p>}
    <div className="form-grid"><Field label={t('duration')}><input type="number" min="5" max="480" value={duration} onChange={e => setDuration(e.target.value)}/></Field><Field label={t('fee')}><input inputMode="decimal" value={fee} onChange={e => { setFee(e.target.value); setFeeTouched(true); }}/></Field></div>
    {!appointment && <div className="form-grid"><Field label={t('repeat')}><select value={repeat} onChange={e => setRepeat(e.target.value as typeof repeat)}>{(['none', 'weekly', 'biweekly', 'monthly'] as const).map(r => <option key={r} value={r}>{t(`repeat${r[0].toUpperCase()}${r.slice(1)}` as TextKey)}</option>)}</select></Field>{repeat !== 'none' && <Field label={t('repeatCount')}><input type="number" min="2" max="52" value={count} onChange={e => setCount(e.target.value)}/></Field>}</div>}
    {appointment?.seriesId && <label className="check-label"><input type="checkbox" checked={following} onChange={e => setFollowing(e.target.checked)}/><span>{t('changeFollowing')}</span></label>}
    {clashes.length > 0 && <Notice error>{repeats > 1 ? `${t('seriesConflicts')} ${clashes.length}` : t('conflictWarning')} {clashes.slice(0, 3).map(c => `${data.clients.find(x => x.id === c.clientId)?.name} · ${c.date} ${c.time}`).join('; ')}</Notice>}
    <Notice>{t('appointmentHint')}</Notice>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose}/>
  </form></Modal>;
}
const zoneLabel = (zone: string, language: 'de' | 'uk') => `${zoneCity(zone, language)} (${utcOffset(zone, Date.now())})`;
export function SessionForm({ vault, clientId, appointment, session, onClose }: { vault: VaultController; clientId?: string; appointment?: Appointment; session?: Session; onClose: () => void }) {
  const { t } = useI18n(); const data = vault.data!;
  const [selected, setSelected] = useState(session?.clientId || appointment?.clientId || clientId || data.clients[0]?.id || '');
  const [date, setDate] = useState(session?.date || appointment?.date || today()); const [time, setTime] = useState(session?.time || appointment?.time || '10:00');
  const [fee, setFee] = useState(feeText(session?.feeCents ?? appointment?.feeCents ?? suggestedFee(data, selected)));
  const [feeTouched, setFeeTouched] = useState(!!(session || appointment));
  const [paid, setPaid] = useState(!!session?.paidAt); const [paymentDate, setPaymentDate] = useState(session?.paidAt || today());
  const [notes, setNotes] = useState(session?.notes || ''); const [tags, setTags] = useState(session?.tags.map(tag => `#${tag}`).join(', ') || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  function choose(id: string) { setSelected(id); if (!feeTouched && id) setFee(feeText(suggestedFee(data, id))); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!selected || !date || !time || (paid && (!paymentDate || paymentDate > today()))) { setError('required'); return; }
    setBusy(true);
    try {
      const result: Session = { id: session?.id ?? uid(), clientId: selected, date, time, feeCents: parseMoney(fee), paidAt: paid ? paymentDate : null, notes: notes.trim(), tags: tagsFrom(tags), appointmentId: session?.appointmentId ?? appointment?.id };
      await vault.update(d => {
        if (session) { const index = d.sessions.findIndex(s => s.id === session.id); if (index >= 0) d.sessions[index] = result; return; }
        if (appointment && d.sessions.some(s => s.appointmentId === appointment.id)) return;
        d.sessions.push(result);
        if (appointment) d.appointments.find(a => a.id === appointment.id)!.status = 'completed';
      }); onClose();
    } catch (err) { setError(err instanceof Error && err.message === 'invalidAmount' ? 'invalidAmount' : 'storageError'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!session || !window.confirm(t('deleteSessionConfirm'))) return;
    setBusy(true);
    try { await vault.update(d => deleteSession(d, session.id)); onClose(); } catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t(session ? 'editSession' : 'addSession')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={t('client')}><select value={selected} disabled={!!appointment} onChange={e => choose(e.target.value)}><option value="">{t('chooseClient')}</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="form-grid"><Field label={t('date')}><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field><Field label={t('time')}><input type="time" value={time} onChange={e => setTime(e.target.value)}/></Field></div>
    <Field label={t('fee')}><input inputMode="decimal" value={fee} onChange={e => { setFee(e.target.value); setFeeTouched(true); }}/></Field>
    <label className="check-label"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)}/><span>{t('paid')}</span></label>
    {paid && <Field label={t('paymentDate')} hint={t('paymentDateHint')}><input type="date" value={paymentDate} max={today()} onChange={e => setPaymentDate(e.target.value)}/></Field>}
    <Field label={t('sessionNotes')}><textarea rows={3} value={notes} maxLength={20000} placeholder={t('sessionNotesPlaceholder')} onChange={e => setNotes(e.target.value)}/></Field>
    <Field label={t('tags')} hint={t('tagsHelp')}><input value={tags} maxLength={500} placeholder={t('tagsPlaceholder')} onChange={e => setTags(e.target.value)}/></Field>
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
