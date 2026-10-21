import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Check, Copy, List, Pencil, Plus, X } from 'lucide-react';
import { translate, useI18n } from '../lib/i18n';
import { addDays, appointmentEnd, appointmentInstant, appointmentStart, byStart, dateLabel, today } from '../lib/dates';
import { mondayOf, weekBlocks } from '../lib/calendar';
import { icsCalendar } from '../lib/ics';
import { copyText, downloadText } from '../lib/files';
import { appointmentView, confirmationFor, utcOffset, zoneCity } from '../lib/zones';
import type { Appointment } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Avatar, Empty, Modal, Notice, PageHeading } from './ui';

export function AppointmentRow({ appointment: a, vault, onClient, actions }: { appointment: Appointment; vault: VaultController; onClient: (id: string) => void; actions?: ReactNode }) {
  const { t, language } = useI18n(); const data = vault.data!; const c = data.clients.find(c => c.id === a.clientId); if (!c) return null;
  const view = appointmentView(a, c, data.settings, language);
  const day = view.practice.iso;
  const relativeDate = day === today() ? t('today') : day === addDays(today(), 1) ? t('tomorrow') : dateLabel(day, language, { day: 'numeric', month: 'short' });
  return <div className="appointment-row"><div className="appointment-time"><strong>{view.practice.time}</strong><small>{relativeDate}</small></div><span className="appointment-line"/><button className="appointment-person" onClick={() => onClient(c.id)}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{a.duration} {t('minutes')} · {view.differs ? `${t('clientTime')}: ${view.clientText}` : `${zoneCity(view.practiceZone, language)}, ${utcOffset(view.practiceZone, view.instant)}`}</small></span></button>{actions || <button className="icon-btn" aria-label={`${t('openProfile')}: ${c.name}`} onClick={() => onClient(c.id)}><ArrowRight size={18}/></button>}</div>;
}

/** Calendar week in the practice's own time zone; blocks are positioned by real start time and length. */
function WeekView({ vault, onEdit }: { vault: VaultController; onEdit: (a: Appointment) => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const zone = data.settings.timeZone;
  const [monday, setMonday] = useState(mondayOf(today()));
  const narrow = useNarrow();
  const blocks = weekBlocks(data.appointments, monday, zone, language);
  const first = Math.max(0, Math.min(8, ...blocks.map(b => Math.floor(b.start / 60)))); const last = Math.min(24, Math.max(19, ...blocks.map(b => Math.ceil(b.end / 60))));
  const hours = Array.from({ length: last - first }, (_, i) => first + i); const pxPerHour = 56;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const name = (a: Appointment) => data.clients.find(c => c.id === a.clientId)?.name ?? '';
  return <section className="card week-card">
    <div className="week-nav"><button className="icon-btn" aria-label={t('previousWeek')} onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft size={19}/></button>
      <strong>{dateLabel(monday, language, { day: 'numeric', month: 'short' })} – {dateLabel(addDays(monday, 6), language, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
      <button className="icon-btn" aria-label={t('nextWeek')} onClick={() => setMonday(addDays(monday, 7))}><ChevronRight size={19}/></button>
      <button className="btn btn-secondary btn-small" onClick={() => setMonday(mondayOf(today()))}>{t('thisWeek')}</button></div>
    <p className="hint">{t('calendarFor')}: {zone}</p>
    {narrow ? <div className="week-agenda">{days.map((d, i) => { const list = blocks.filter(b => b.day === i).sort((a, b) => a.start - b.start); return <div key={d} className={`agenda-day ${d === today() ? 'is-today' : ''}`}><h3>{dateLabel(d, language, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>{list.length ? list.map(b => <button key={b.appointment.id} className={`week-block static status-${b.appointment.status}`} onClick={() => onEdit(b.appointment)}><strong>{b.time}</strong> {name(b.appointment)}</button>) : <small className="hint">—</small>}</div>; })}</div>
    : <div className="week-grid" style={{ ['--hours' as string]: hours.length, ['--hour-px' as string]: `${pxPerHour}px` }}>
      <div className="week-corner"/>{days.map(d => <div key={d} className={`week-head ${d === today() ? 'is-today' : ''}`}>{dateLabel(d, language, { weekday: 'short', day: 'numeric' })}</div>)}
      <div className="week-hours">{hours.map(h => <span key={h} style={{ height: pxPerHour }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      {days.map((d, i) => <div key={d} className={`week-day ${d === today() ? 'is-today' : ''}`} style={{ height: hours.length * pxPerHour }}>
        {blocks.filter(b => b.day === i).map(b => <button key={b.appointment.id} className={`week-block status-${b.appointment.status}`} title={`${b.time} ${name(b.appointment)}`} onClick={() => onEdit(b.appointment)}
          style={{ top: (b.start - first * 60) / 60 * pxPerHour, height: Math.max(22, (b.end - b.start) / 60 * pxPerHour - 2), left: `${b.lane / b.lanes * 100}%`, width: `calc(${100 / b.lanes}% - 3px)` }}><strong>{b.time}</strong> {name(b.appointment)}</button>)}</div>)}
    </div>}
  </section>;
}
function useNarrow() {
  const query = '(max-width: 760px)'; const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => { const media = window.matchMedia(query); const on = () => setNarrow(media.matches); media.addEventListener('change', on); return () => media.removeEventListener('change', on); }, []);
  return narrow;
}

export function AppointmentsPage({ vault, onNew, onClient, onComplete, onEdit }: { vault: VaultController; onNew: () => void; onClient: (id: string) => void; onComplete: (a: Appointment) => void; onEdit: (a: Appointment) => void }) {
  const { t, language } = useI18n(); const data = vault.data!;
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming'); const [mode, setMode] = useState<'list' | 'week'>('list');
  const [message, setMessage] = useState<string>(); const [exporting, setExporting] = useState(false);
  const startOfToday = new Date(`${today()}T00:00:00`).getTime();
  const upcoming = (a: Appointment) => a.status === 'scheduled' && appointmentEnd(a) >= startOfToday;
  const appointments = [...data.appointments].filter(a => filter === 'all' || (filter === 'upcoming' ? upcoming(a) : !upcoming(a))).sort((a, b) => byStart(a, b) * (filter === 'past' ? -1 : 1));
  async function copy(a: Appointment) {
    const client = data.clients.find(c => c.id === a.clientId); if (!client) return;
    setMessage(await copyText(confirmationFor(a, client, data.settings)) ? t('copied') : t('copyFailed'));
  }
  function ics(a: Appointment) {
    const client = data.clients.find(c => c.id === a.clientId); if (!client) return;
    const lang = client.language; const start = appointmentInstant(a);
    const title = `${translate(lang, 'appointmentWord')}${data.settings.practice.name ? ` – ${data.settings.practice.name}` : ''}`;
    downloadText(`termin-${a.date}.ics`, icsCalendar([{ uid: a.id, start, end: new Date(appointmentStart(a) + a.duration * 60000).toISOString(), summary: title, description: confirmationFor(a, client, data.settings).split('\n')[0] }], title), 'text/calendar');
  }
  function cancel(a: Appointment) {
    if (!window.confirm(t('cancelAppointmentConfirm'))) return;
    const later = a.seriesId ? data.appointments.filter(x => x.seriesId === a.seriesId && x.id !== a.id && x.status === 'scheduled' && appointmentStart(x) > appointmentStart(a)) : [];
    const all = later.length > 0 && window.confirm(`${t('cancelFollowingConfirm')} (${later.length})`);
    const ids = new Set([a.id, ...(all ? later.map(x => x.id) : [])]);
    void vault.update(d => { for (const x of d.appointments) if (ids.has(x.id)) x.status = 'cancelled'; }).catch(() => {});
  }
  function exportCalendar(withNames: boolean) {
    const list = data.appointments.filter(upcoming).sort(byStart);
    if (!list.length) { setMessage(t('noUpcomingToExport')); setExporting(false); return; }
    const events = list.map(a => ({ uid: a.id, start: appointmentInstant(a), end: new Date(appointmentEnd(a)).toISOString(), summary: withNames ? `${data.clients.find(c => c.id === a.clientId)?.name ?? ''} – ${t('appointmentWord')}` : t('appointmentWord') }));
    downloadText('praxisraum-termine.ics', icsCalendar(events, data.settings.practice.name || 'Praxisraum'), 'text/calendar'); setExporting(false);
  }
  return <><PageHeading title={t('appointments')} subtitle={t('appointmentsSubtitle')} action={<div className="button-row"><button className="btn btn-secondary" onClick={() => setExporting(true)}><CalendarPlus size={17}/>{t('exportCalendar')}</button><button className="btn btn-primary" onClick={onNew}><Plus size={17}/>{t('newAppointment')}</button></div>}/>
    {message && <Notice>{message}</Notice>}
    <div className="toolbar-row"><div className="segmented-tabs" role="group">{mode === 'list' && (['upcoming', 'past', 'all'] as const).map(f => <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{t(f)}</button>)}</div>
      <div className="segmented-tabs small-tabs" role="group"><button className={mode === 'list' ? 'active' : ''} aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={15}/> {t('listView')}</button><button className={mode === 'week' ? 'active' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}><CalendarDays size={15}/> {t('weekView')}</button></div></div>
    {mode === 'week' ? <WeekView vault={vault} onEdit={onEdit}/> : <section className="card appointments-card">{appointments.length ? appointments.map(a => <AppointmentRow key={a.id} appointment={a} vault={vault} onClient={onClient} actions={<div className="appointment-row-actions">{a.status === 'scheduled' ? <>
      <button className="btn btn-secondary btn-small" onClick={() => onComplete(a)}><Check size={16}/>{t('completeAppointment')}</button>
      <button className="icon-btn" title={t('editAppointment')} aria-label={t('editAppointment')} onClick={() => onEdit(a)}><Pencil size={17}/></button>
      <button className="icon-btn" title={t('copyConfirmation')} aria-label={t('copyConfirmation')} onClick={() => void copy(a)}><Copy size={17}/></button>
      <button className="icon-btn" title={t('addToCalendar')} aria-label={t('addToCalendar')} onClick={() => ics(a)}><CalendarPlus size={17}/></button>
      <button className="icon-btn danger" title={t('cancelAppointment')} aria-label={t('cancelAppointment')} onClick={() => cancel(a)}><X size={17}/></button></> : <span className="tag-chip">{t(a.status)}</span>}</div>}/>) : <Empty icon={<CalendarDays size={28}/>} title={t('noAppointments')} text={t('noAppointmentsText')} action={<button className="btn btn-primary" onClick={onNew}>{t('newAppointment')}</button>}/>}</section>}
    {exporting && <Modal title={t('exportCalendar')} onClose={() => setExporting(false)}><Notice error>{t('exportCalendarHint')}</Notice><div className="form-actions"><button className="btn btn-secondary" onClick={() => exportCalendar(false)}>{t('withoutNames')}</button><button className="btn btn-primary" onClick={() => exportCalendar(true)}>{t('withNames')}</button></div></Modal>}
  </>;
}
