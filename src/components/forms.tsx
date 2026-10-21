import { useEffect, useState, type FormEvent } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { uid, type Appointment, type Client, type Session } from '../lib/types';
import { appointmentInstant, parseMoney, tagsFrom, today } from '../lib/dates';
import { compressImage } from '../lib/images';
import type { VaultController } from '../lib/useVault';
import { Avatar, Field, Modal, Notice } from './ui';
function Actions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label?: string }) {
  const { t } = useI18n();
  return <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {busy ? t('working') : label || t('save')}</button></div>;
}
export function ClientForm({ vault, client, onClose, onSaved }: { vault: VaultController; client?: Client; onClose: () => void; onSaved: (id: string) => void }) {
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
      await vault.update(data => { const index = data.clients.findIndex(c => c.id === result.id); if (index < 0) data.clients.push(result); else data.clients[index] = result; });
      onSaved(result.id);
    } catch (err) { setError(err instanceof Error && err.message === 'invalidImage' ? 'invalidImage' : 'storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t(client ? 'editClient' : 'newClient')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <div className="avatar-upload">{preview ? <img className="avatar avatar-large" src={preview} alt={t('avatar')}/> : client ? <Avatar client={client} vault={vault} large/> : <span className="avatar avatar-large"><Camera size={26}/></span>}<div><label className="btn btn-secondary file-label"><Camera size={17}/>{t(client ? 'changeAvatar' : 'addAvatar')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { setFile(e.target.files?.[0]); e.target.value = ''; }}/></label><small>{t('avatarHint')}</small></div></div>
    <Field label={`${t('name')} *`}><input autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder={t('namePlaceholder')} autoComplete="off" required/></Field>
    <Field label={t('contact')}><input value={contact} maxLength={160} onChange={e => setContact(e.target.value)} placeholder={t('contactPlaceholder')}/></Field>
    <div className="form-section"><h3>{t('clientLanguage')}</h3><label className="check-label"><input type="checkbox" checked={ukrainian} onChange={e => setUkrainian(e.target.checked)}/><span>{t('ukrainianReminders')}</span></label><p className="hint">{t('languageHelp')}</p></div>
    <Field label={t('telegramChatId')} hint={t('chatHelp')}><input value={chat} maxLength={24} inputMode="numeric" onChange={e => setChat(e.target.value)} placeholder={t('chatPlaceholder')}/></Field>
    <label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{t('reminderConsent')}</span></label>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose}/>
  </form></Modal>;
}
export function AppointmentForm({ vault, clientId, onClose }: { vault: VaultController; clientId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(clientId || vault.data!.clients[0]?.id || '');
  const [date, setDate] = useState(today()); const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('50'); const [fee, setFee] = useState('85,00');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!selected || !date || !time || !Number.isInteger(Number(duration)) || Number(duration) < 5 || Number(duration) > 480) { setError('required'); return; }
    setBusy(true);
    try {
      const appointment: Appointment = { id: uid(), clientId: selected, date, time, duration: Number(duration), feeCents: parseMoney(fee), timeZone: vault.data!.settings.timeZone, reminderId: uid(), status: 'scheduled' };
      appointmentInstant(appointment);
      await vault.update(data => { data.appointments.push(appointment); }); onClose();
    } catch (err) { setError(err instanceof Error && err.message === 'invalidAmount' ? 'invalidAmount' : 'required'); } finally { setBusy(false); }
  }
  return <Modal title={t('newAppointment')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={`${t('client')} *`}><select value={selected} onChange={e => setSelected(e.target.value)} required><option value="">{t('chooseClient')}</option>{vault.data!.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="form-grid"><Field label={`${t('date')} *`}><input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field><Field label={`${t('time')} *`}><input type="time" value={time} onChange={e => setTime(e.target.value)} required/></Field></div>
    <div className="form-grid"><Field label={t('duration')}><input type="number" min="5" max="480" value={duration} onChange={e => setDuration(e.target.value)}/></Field><Field label={t('fee')}><input inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)}/></Field></div>
    <p className="hint">{t('timeZone')}: {vault.data!.settings.timeZone}</p><Notice>{t('appointmentHint')}</Notice>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose}/>
  </form></Modal>;
}
export function SessionForm({ vault, clientId, appointment, onClose }: { vault: VaultController; clientId?: string; appointment?: Appointment; onClose: () => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(appointment?.clientId || clientId || vault.data!.clients[0]?.id || '');
  const [date, setDate] = useState(appointment?.date || today()); const [time, setTime] = useState(appointment?.time || '10:00');
  const [fee, setFee] = useState(((appointment?.feeCents ?? 8500) / 100).toFixed(2).replace('.', ','));
  const [paid, setPaid] = useState(false); const [paymentDate, setPaymentDate] = useState(today());
  const [notes, setNotes] = useState(''); const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined);
    if (!selected || !date || !time || (paid && !paymentDate)) { setError('required'); return; }
    setBusy(true);
    try {
      const session: Session = { id: uid(), clientId: selected, date, time, feeCents: parseMoney(fee), paidAt: paid ? paymentDate : null, notes: notes.trim(), tags: tagsFrom(tags), appointmentId: appointment?.id };
      await vault.update(data => {
        if (appointment && data.sessions.some(s => s.appointmentId === appointment.id)) return;
        data.sessions.push(session);
        if (appointment) data.appointments.find(a => a.id === appointment.id)!.status = 'completed';
      }); onClose();
    } catch (err) { setError(err instanceof Error && err.message === 'invalidAmount' ? 'invalidAmount' : 'storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t('addSession')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={t('client')}><select value={selected} disabled={!!appointment} onChange={e => setSelected(e.target.value)}><option value="">{t('chooseClient')}</option>{vault.data!.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="form-grid"><Field label={t('date')}><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field><Field label={t('time')}><input type="time" value={time} onChange={e => setTime(e.target.value)}/></Field></div>
    <Field label={t('fee')}><input inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)}/></Field>
    <label className="check-label"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)}/><span>{t('paid')}</span></label>
    {paid && <Field label={t('paymentDate')} hint={t('paymentDateHint')}><input type="date" value={paymentDate} max={today()} onChange={e => setPaymentDate(e.target.value)}/></Field>}
    <Field label={t('sessionNotes')}><textarea rows={3} value={notes} maxLength={20000} placeholder={t('sessionNotesPlaceholder')} onChange={e => setNotes(e.target.value)}/></Field>
    <Field label={t('tags')} hint={t('tagsHelp')}><input value={tags} maxLength={500} placeholder={t('tagsPlaceholder')} onChange={e => setTags(e.target.value)}/></Field>
    {error && <Notice error>{t(error)}</Notice>}<Actions busy={busy} onClose={onClose}/>
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
