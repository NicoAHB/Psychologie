import { useEffect, useState, type FormEvent } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { uid, type Appointment, type Client, type Session } from '../lib/types';
import { appointmentInstant, parseMoney, tagsFrom, today } from '../lib/dates';
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
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey>();
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!name.trim() || (chat && !/^-?\d+$/.test(chat))) { setError('required'); return; }
    setBusy(true);
    try {
      const avatarId = file ? await vault.addImage(await compressImage(file, true)) : client?.avatarId;
      const result: Client = { id: client?.id || uid(), name: name.trim(), contact: contact.trim(), createdAt: client?.createdAt || today(), preparation: client?.preparation || '', language: ukrainian ? 'uk' : 'de', telegramChatId: chat.trim(), reminderConsent: consent, avatarId };
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
    <div className="form-section"><h3>{t('clientLanguage')}</h3><label className="check-label"><input type="checkbox" checked={ukrainian} onChange={e => setUkrainian(e.target.checked)}/><span>{t('ukrainianReminders')}</span></label><p className="hint">{t('languageHelp')}</p></div>
    <Field label={t('telegramChatId')} hint={t('chatHelp')}><input value={chat} maxLength={24} inputMode="numeric" onChange={e => setChat(e.target.value)} placeholder={t('chatPlaceholder')}/></Field>
    <label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{t('reminderConsent')}</span></label>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose} onDelete={client && onDeleted ? () => void removeClient() : undefined} deleteLabel={t('deleteClient')}/>
  </form></Modal>;
}
export function AppointmentForm({ vault, clientId, appointment, onClose }: { vault: VaultController; clientId?: string; appointment?: Appointment; onClose: () => void }) {
  const { t } = useI18n(); const data = vault.data!;
  const [selected, setSelected] = useState(appointment?.clientId || clientId || data.clients[0]?.id || '');
  const [date, setDate] = useState(appointment?.date || today()); const [time, setTime] = useState(appointment?.time || '10:00');
  const [duration, setDuration] = useState(String(appointment?.duration ?? 50)); const [fee, setFee] = useState(feeText(appointment?.feeCents ?? suggestedFee(data, selected)));
  const [feeTouched, setFeeTouched] = useState(!!appointment);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  const length = Number(duration);
  const clash = Number.isInteger(length) && length > 0 && date && time ? findConflict(data.appointments, { id: appointment?.id ?? '', date, time, duration: length }) : undefined;
  const clashClient = clash && data.clients.find(c => c.id === clash.clientId);
  function choose(id: string) { setSelected(id); if (!feeTouched && id) setFee(feeText(suggestedFee(data, id))); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!selected || !date || !time || !Number.isInteger(length) || length < 5 || length > 480) { setError('required'); return; }
    setBusy(true);
    try {
      const feeCents = parseMoney(fee);
      // A rescheduled appointment gets a fresh reminder so an already delivered one cannot suppress the new date.
      const moved = !!appointment && (appointment.date !== date || appointment.time !== time);
      const result: Appointment = { id: appointment?.id ?? uid(), clientId: selected, date, time, duration: length, feeCents, timeZone: appointment?.timeZone ?? data.settings.timeZone, reminderId: appointment && !moved ? appointment.reminderId : uid(), status: appointment?.status ?? 'scheduled' };
      appointmentInstant(result);
      await vault.update(d => { const index = d.appointments.findIndex(a => a.id === result.id); if (index < 0) d.appointments.push(result); else d.appointments[index] = result; }); onClose();
    } catch (err) { setError(err instanceof Error && err.message === 'invalidAmount' ? 'invalidAmount' : 'required'); } finally { setBusy(false); }
  }
  return <Modal title={t(appointment ? 'editAppointment' : 'newAppointment')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={`${t('client')} *`}><select value={selected} onChange={e => choose(e.target.value)} required><option value="">{t('chooseClient')}</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="form-grid"><Field label={`${t('date')} *`}><input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field><Field label={`${t('time')} *`}><input type="time" value={time} onChange={e => setTime(e.target.value)} required/></Field></div>
    <div className="form-grid"><Field label={t('duration')}><input type="number" min="5" max="480" value={duration} onChange={e => setDuration(e.target.value)}/></Field><Field label={t('fee')}><input inputMode="decimal" value={fee} onChange={e => { setFee(e.target.value); setFeeTouched(true); }}/></Field></div>
    {clash && <Notice error>{t('conflictWarning')} {clashClient?.name} · {clash.time}–{clockAfter(clash.time, clash.duration)}</Notice>}
    <p className="hint">{t('timeZone')}: {appointment?.timeZone ?? data.settings.timeZone}</p><Notice>{t('appointmentHint')}</Notice>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose}/>
  </form></Modal>;
}
function clockAfter(time: string, minutes: number) { const total = (Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
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
