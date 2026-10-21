import { useState, type FormEvent } from 'react';
import { CalendarOff, Pencil, Trash2 } from 'lucide-react';
import { absenceRange, conflictsWithAbsence } from '../lib/availability';
import { dateLabel, today } from '../lib/dates';
import { appointmentView } from '../lib/zones';
import { useI18n, type TextKey } from '../lib/i18n';
import { uid, type CalendarAbsence } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

export function AvailabilityForm({ vault, absence, onClose, onSaved }: { vault: VaultController; absence?: CalendarAbsence; onClose: () => void; onSaved?: (absence: CalendarAbsence) => void }) {
  const { t, language } = useI18n(); const [kind, setKind] = useState<CalendarAbsence['kind']>(absence?.kind ?? 'vacation'); const [title, setTitle] = useState(absence?.title ?? '');
  const [fromDate, setFromDate] = useState(absence?.fromDate ?? today()); const [untilDate, setUntilDate] = useState(absence?.untilDate ?? today()); const [allDay, setAllDay] = useState(absence?.allDay ?? true);
  const [startTime, setStartTime] = useState(absence?.startTime ?? '09:00'); const [endTime, setEndTime] = useState(absence?.endTime ?? '17:00'); const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  const candidate: CalendarAbsence = { id: absence?.id ?? '', kind, title: title.trim(), fromDate, untilDate, allDay, ...(allDay ? {} : { startTime, endTime }), timeZone: absence?.timeZone ?? vault.data!.settings.timeZone };
  const conflicts = vault.data!.appointments.filter(a => a.status === 'scheduled' && conflictsWithAbsence(a, candidate));
  async function save(e: FormEvent) { e.preventDefault(); setError(undefined); setBusy(true); try { absenceRange(candidate); const item = { ...candidate, id: absence?.id ?? uid() }; await vault.update(d => { const index = d.availability.findIndex(a => a.id === item.id); if (index >= 0) d.availability[index] = item; else d.availability.push(item); }); if (onSaved) onSaved(item); else onClose(); } catch (e) { setError(e instanceof Error && e.message === 'availabilityInvalid' ? 'availabilityInvalid' : 'storageError'); } finally { setBusy(false); } }
  async function remove() { if (!absence || !window.confirm(t('availabilityDeleteConfirm'))) return; setBusy(true); try { await vault.update(d => { d.availability = d.availability.filter(a => a.id !== absence.id); }); onClose(); } catch { setError('storageError'); } finally { setBusy(false); } }
  return <Modal title={t(absence ? 'availabilityEdit' : 'availabilityNew')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={save} noValidate>
    <Field label={t('availabilityKind')}><select value={kind} onChange={e => setKind(e.target.value as CalendarAbsence['kind'])}><option value="vacation">{t('availabilityVacation')}</option><option value="unavailable">{t('availabilityAway')}</option></select></Field>
    <Field label={t('availabilityTitle')}><textarea value={title} rows={2} maxLength={500} placeholder={t('availabilityPlaceholder')} onChange={e => setTitle(e.target.value)}/></Field>
    <div className="form-grid"><Field label={t('availabilityStart')}><input type="date" value={fromDate} onChange={e => { const value = e.target.value; setFromDate(value); if (value > untilDate) setUntilDate(value); }}/></Field><Field label={t('availabilityEnd')}><input type="date" min={fromDate} value={untilDate} onChange={e => setUntilDate(e.target.value)}/></Field></div>
    <label className="check-label"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}/><span>{t('availabilityAllDay')}</span></label>
    {!allDay && <div className="form-grid"><Field label={t('availabilityTimeStart')}><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}/></Field><Field label={t('availabilityTimeEnd')}><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}/></Field></div>}
    <p className="hint">{t('calendarFor')}: {candidate.timeZone}</p><Notice>{t('availabilityHint')}</Notice>
    {conflicts.length > 0 && <Notice error>{t('availabilityConflict')}<ul className="absence-conflict-list">{conflicts.slice(0, 8).map(a => { const view = appointmentView(a, vault.data!.clients.find(c => c.id === a.clientId), { ...vault.data!.settings, timeZone: candidate.timeZone }, language); return <li key={a.id}>{dateLabel(view.practice.iso, language, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {view.practice.time} · {vault.data!.clients.find(c => c.id === a.clientId)?.name}</li>; })}</ul></Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions">{absence && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16}/>{t('availabilityDelete')}</button>}<button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}><CalendarOff size={16}/>{t('save')}</button></div>
  </form></Modal>;
}

export function AvailabilityList({ vault, filter, onEdit }: { vault: VaultController; filter: 'upcoming' | 'past' | 'all'; onEdit: (absence: CalendarAbsence) => void }) {
  const { t, language } = useI18n();
  const list = vault.data!.availability.filter(a => { try { const past = absenceRange(a).end <= Date.now(); return filter === 'all' || (filter === 'past' ? past : !past); } catch { return false; } }).sort((a, b) => a.fromDate.localeCompare(b.fromDate) * (filter === 'past' ? -1 : 1));
  const date = (value: string) => dateLabel(value, language, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return <section className="card availability-list"><div className="section-heading"><h2><CalendarOff size={18}/>{t('availabilityList')}</h2></div>{!list.length ? <p className="hint">{t('availabilityNone')}</p> : <ul>{list.map(a => <li key={a.id} className={`absence-list-item absence-${a.kind}`}><CalendarOff size={20}/><div><strong>{a.title || t(a.kind === 'vacation' ? 'availabilityVacation' : 'availabilityAway')}</strong><span>{date(a.fromDate)}{a.untilDate !== a.fromDate ? ` – ${date(a.untilDate)}` : ''} · {a.allDay ? t('availabilityAllDay') : `${a.startTime} – ${a.endTime}`}</span></div><button className="icon-btn" aria-label={`${t('availabilityEdit')}: ${a.title || date(a.fromDate)}`} onClick={() => onEdit(a)}><Pencil size={18}/></button></li>)}</ul>}</section>;
}
