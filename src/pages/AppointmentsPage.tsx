import { WaitlistPanel } from '../components/Waitlist';
import { releaseSlot } from '../lib/waitlist';
import { AppointmentFailure } from '../components/AppointmentFailure';
import { AppointmentEmail } from '../components/AppointmentEmail';
import { HelpButton } from '../components/HelpButton';
import { PaymentMethodField } from '../components/PaymentMethodField';
import type { PaymentMethod } from '../lib/types';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, CalendarOff, CalendarPlus, ChevronLeft, ChevronRight, Check, Copy, List, Pencil, Plus, X } from 'lucide-react';
import { translate, useI18n } from '../lib/i18n';
import { addDays, appointmentEnd, appointmentInstant, appointmentStart, byStart, dateLabel, isIsoDay, today, zonedInstant } from '../lib/dates';
import { mondayOf, weekBlocks } from '../lib/calendar';
import { icsCalendar } from '../lib/ics';
import { copyText, downloadText } from '../lib/files';
import { appointmentView, confirmationFor, utcOffset, zoneCity } from '../lib/zones';
import { dayAbsences, conflictsWithAbsence } from '../lib/availability';
import { AvailabilityForm, AvailabilityList } from '../components/availability';
import type { Appointment, CalendarAbsence } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Avatar, Empty, Modal, Notice, PageHeading } from '../components/ui';
import { clockText, TimePair } from '../components/DualTime';

export function AppointmentRow({ appointment: a, vault, onClient, actions }: { appointment: Appointment; vault: VaultController; onClient: (id: string) => void; actions?: ReactNode }) {
  const { t, language } = useI18n(); const data = vault.data!; const c = data.clients.find(c => c.id === a.clientId); if (!c) return null;
  const view = appointmentView(a, c, data.settings, language);
  const day = view.practice.iso; const absent = a.status === 'scheduled' && data.availability.some(block => conflictsWithAbsence(a, block));
  const relativeDate = day === today() ? t('today') : day === addDays(today(), 1) ? t('tomorrow') : dateLabel(day, language, { day: 'numeric', month: 'short' });
  return <div className="appointment-row"><div className="appointment-time"><TimePair practice={view.practice} client={view.client} differs={view.differs}/><small>{relativeDate}</small></div><span className="appointment-line"/><button className="appointment-person" onClick={() => onClient(c.id)}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{a.duration} {t('minutes')} · {view.differs ? `${t('forClient')}: ${clockText(view.client.time, language)} (${view.client.place}, ${view.client.offset})` : `${view.practice.place}, ${view.practice.offset}`}</small>{absent && <small className="appointment-away-warning">{t('availabilityAppointmentConflict')}</small>}</span></button>{actions || <button className="icon-btn" aria-label={`${t('openProfile')}: ${c.name}`} onClick={() => onClient(c.id)}><ArrowRight size={18}/></button>}</div>;
}

/** Calendar week in the practice's own time zone; blocks are positioned by real start time and length. */
function WeekView({ vault, onEdit, onEditAbsence, focusDate }: { vault: VaultController; onEdit: (a: Appointment) => void; onEditAbsence: (absence: CalendarAbsence) => void; focusDate?: string }) {
  const { t, language } = useI18n(); const data = vault.data!; const zone = data.settings.timeZone;
  const [monday, setMonday] = useState(mondayOf(focusDate ?? today()));
  useEffect(() => { if (focusDate) setMonday(mondayOf(focusDate)); }, [focusDate]);
  const offsetStart = utcOffset(zone, Date.parse(zonedInstant(monday, '12:00', zone))); const offsetEnd = utcOffset(zone, Date.parse(zonedInstant(addDays(monday, 6), '12:00', zone))); const offsetLabel = offsetStart === offsetEnd ? offsetStart : `${offsetStart} / ${offsetEnd}`;
  const narrow = useNarrow();
  const blocks = weekBlocks(data.appointments, monday, zone, language);
  const absenceDays = Array.from({ length: 7 }, (_, i) => dayAbsences(data.availability, addDays(monday, i), zone, language));
  const timed = absenceDays.flat().filter(a => !a.fullDay);
  const first = Math.max(0, Math.min(8, ...blocks.map(b => Math.floor(b.start / 60)), ...timed.map(b => Math.floor(b.start / 60)))); const last = Math.min(24, Math.max(19, ...blocks.map(b => Math.ceil(b.end / 60)), ...timed.map(b => Math.ceil(b.end / 60))));
  const hours = Array.from({ length: last - first }, (_, i) => first + i); const pxPerHour = 56;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const absenceLabel = (absence: CalendarAbsence) => absence.title || t(absence.kind === 'vacation' ? 'availabilityVacation' : 'availabilityAway');
  const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const name = (a: Appointment) => data.clients.find(c => c.id === a.clientId)?.name ?? '';
  /** Second line of a block: the client's own local time, whenever it differs from the practice's. */
  const theirs = (a: Appointment) => { const v = appointmentView(a, data.clients.find(c => c.id === a.clientId), data.settings, language); return v.differs ? `${v.client.time} ${v.client.tag}${v.client.shift ? (v.client.shift > 0 ? ' +1' : ' −1') : ''}` : ''; };
  return <section className="card week-card">
    <div className="week-nav"><button className="icon-btn" aria-label={t('previousWeek')} onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft size={19}/></button>
      <strong>{dateLabel(monday, language, { day: 'numeric', month: 'short' })} – {dateLabel(addDays(monday, 6), language, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
      <button className="icon-btn" aria-label={t('nextWeek')} onClick={() => setMonday(addDays(monday, 7))}><ChevronRight size={19}/></button>
      <button className="btn btn-secondary btn-small" onClick={() => setMonday(mondayOf(today()))}>{t('thisWeek')}</button><label className="week-jump"><span>{t('calendarGoTo')}</span><input type="date" aria-label={t('calendarGoTo')} value={monday} onChange={e => { if (isIsoDay(e.target.value)) setMonday(mondayOf(e.target.value)); }}/></label></div>
    <p className="hint">{t('calendarFor')}: {zoneCity(zone, language)}, {offsetLabel}</p>
    {narrow ? <div className="week-agenda">{days.map((d, i) => { const list = blocks.filter(b => b.day === i).sort((a, b) => a.start - b.start); return <div key={d} className={`agenda-day ${d === today() ? 'is-today' : ''}`}><h3>{dateLabel(d, language, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>{absenceDays[i].map(({ absence, fullDay, start, end }) => <button key={absence.id} className={`absence-banner absence-${absence.kind}`} onClick={() => onEditAbsence(absence)}><CalendarOff size={15}/><span>{absenceLabel(absence)} · {fullDay ? t('availabilityAllDay') : `${clock(start)} – ${clock(end)}`}</span></button>)}{list.length ? list.map(b => <button key={b.appointment.id} className={`week-block static status-${b.appointment.status} ${data.availability.some(a => conflictsWithAbsence(b.appointment, a)) ? 'conflicts-absence' : ''}`} onClick={() => onEdit(b.appointment)}><strong>{b.time}</strong> {name(b.appointment)}{theirs(b.appointment) && <span className="w2">{t('clientTime')}: {theirs(b.appointment)}</span>}</button>) : <small className="hint">—</small>}</div>; })}</div>
    : <div className="week-grid" style={{ ['--hours' as string]: hours.length, ['--hour-px' as string]: `${pxPerHour}px` }}>
      <div className="week-corner"/>{days.map(d => <div key={d} className={`week-head ${d === today() ? 'is-today' : ''} ${absenceDays[days.indexOf(d)].length ? 'has-absence' : ''}`}><span>{dateLabel(d, language, { weekday: 'short', day: 'numeric' })}</span>{absenceDays[days.indexOf(d)].map(({ absence }) => <button key={absence.id} className={`absence-banner absence-${absence.kind}`} title={absenceLabel(absence)} onClick={() => onEditAbsence(absence)}><CalendarOff size={12}/><span>{absenceLabel(absence)}</span></button>)}</div>)}
      <div className="week-hours">{hours.map(h => <span key={h} style={{ height: pxPerHour }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      {days.map((d, i) => <div key={d} className={`week-day ${d === today() ? 'is-today' : ''}`} style={{ height: hours.length * pxPerHour }}>
        {absenceDays[i].map(({ absence, start, end }) => <div key={absence.id} className={`week-absence absence-${absence.kind}`} aria-hidden="true" style={{ top: Math.max(0, start - first * 60) / 60 * pxPerHour, height: Math.max(0, Math.min(last * 60, end) - Math.max(first * 60, start)) / 60 * pxPerHour }}><span>{absenceLabel(absence)}</span></div>)}
        {blocks.filter(b => b.day === i).map(b => <button key={b.appointment.id} className={`week-block status-${b.appointment.status} ${data.availability.some(a => conflictsWithAbsence(b.appointment, a)) ? 'conflicts-absence' : ''}`} title={`${t('practiceTime')} ${b.time}${theirs(b.appointment) ? ` · ${t('clientTime')} ${theirs(b.appointment)}` : ''} · ${name(b.appointment)}`} onClick={() => onEdit(b.appointment)}
          style={{ top: (b.start - first * 60) / 60 * pxPerHour, height: Math.max(22, (b.end - b.start) / 60 * pxPerHour - 2), left: `${b.lane / b.lanes * 100}%`, width: `calc(${100 / b.lanes}% - 3px)` }}><strong>{b.time}</strong> {name(b.appointment)}{theirs(b.appointment) && <span className="w2">{t('clientTime')}: {theirs(b.appointment)}</span>}</button>)}</div>)}
    </div>}
  </section>;
}
function useNarrow() {
  const query = '(max-width: 1050px)'; const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => { const media = window.matchMedia(query); const on = () => setNarrow(media.matches); media.addEventListener('change', on); return () => media.removeEventListener('change', on); }, []);
  return narrow;
}

export function AppointmentsPage({ vault, onNew, onBackfill, onClient, onComplete, onEdit, quickMethod, onMethod, onQuickComplete, quickBusy, focusWaitlist }: { focusWaitlist?: boolean; quickMethod: PaymentMethod; onMethod: (method: PaymentMethod) => void; onQuickComplete: (a: Appointment) => void; quickBusy: boolean; vault: VaultController; onNew: () => void; onBackfill: () => void; onClient: (id: string) => void; onComplete: (a: Appointment) => void; onEdit: (a: Appointment) => void }) {
  const { t } = useI18n(); const data = vault.data!;
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming'); const [mode, setMode] = useState<'list' | 'week'>('list');
  const [failedAppointment, setFailedAppointment] = useState<Appointment>(); const [emailAppointment,setEmailAppointment] = useState<Appointment>();
  const [absenceForm, setAbsenceForm] = useState<CalendarAbsence | 'new'>(); const [weekFocusDate, setWeekFocusDate] = useState<string>();
  const [message, setMessage] = useState<string>(); const [exporting, setExporting] = useState(false);
  const [limit,setLimit] = useState(100);
  useEffect(() => { setLimit(100); },[filter]);
  useEffect(() => { if(focusWaitlist) { const node=document.getElementById('waitlist-panel');node?.focus();node?.scrollIntoView({block:'start'}); } },[focusWaitlist]);
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
    void vault.update(d => { for (const x of d.appointments) if (ids.has(x.id)) { releaseSlot(x); x.status = 'cancelled'; } }).catch(() => {});
  }
  function exportCalendar(withNames: boolean) {
    const list = data.appointments.filter(upcoming).sort(byStart);
    if (!list.length) { setMessage(t('noUpcomingToExport')); setExporting(false); return; }
    const events = list.map(a => ({ uid: a.id, start: appointmentInstant(a), end: new Date(appointmentEnd(a)).toISOString(), summary: withNames ? `${data.clients.find(c => c.id === a.clientId)?.name ?? ''} – ${t('appointmentWord')}` : t('appointmentWord') }));
    downloadText('praxisraum-termine.ics', icsCalendar(events, data.settings.practice.name || 'Praxisraum'), 'text/calendar'); setExporting(false);
  }
  return <><PageHeading title={t('appointments')} subtitle={t('appointmentsSubtitle')} action={<div className="button-row calendar-actions"><button className="btn btn-secondary" onClick={() => setAbsenceForm('new')}><CalendarOff size={17}/>{t('availabilityNew')}</button><button className="btn btn-secondary" onClick={() => setExporting(true)}><CalendarPlus size={17}/>{t('exportCalendar')}</button><button className="btn btn-primary" onClick={onNew}><Plus size={17}/>{t('newAppointment')}</button></div>}/>
    {message && <Notice>{message}</Notice>}
    <div className="quick-payment-controls"><PaymentMethodField quick value={quickMethod} onChange={method => onMethod(method ?? 'transfer')}/><HelpButton topic="appointments" text="helpAppointments"/></div>
    <div className="appointment-backfill"><button className="btn btn-secondary" onClick={onBackfill}><Plus size={17}/>{t('addSession')}</button><p className="hint">{t('backfillHint')}</p></div>
    <div className="toolbar-row">{mode === 'list' ? <div className="segmented-tabs" role="group" aria-label={t('appointmentFilters')}>{(['upcoming', 'past', 'all'] as const).map(f => <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(f)}</button>)}</div> : <span/>}
      <div className="segmented-tabs small-tabs" role="group"><button className={mode === 'list' ? 'active' : ''} aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={15}/> {t('listView')}</button><button className={mode === 'week' ? 'active' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}><CalendarDays size={15}/> {t('weekView')}</button></div></div>
    {mode === 'week' ? <WeekView vault={vault} onEdit={onEdit} focusDate={weekFocusDate} onEditAbsence={setAbsenceForm}/> : <section className="card appointments-card">{appointments.length ? appointments.slice(0,limit).map(a => <AppointmentRow key={a.id} appointment={a} vault={vault} onClient={onClient} actions={<div className="appointment-row-actions">{a.status === 'scheduled' ? <>
      <button className="btn btn-secondary btn-small" onClick={() => onComplete(a)}><Check size={16}/>{t('completeAppointment')}</button>
      <button className="btn btn-secondary btn-small" disabled={quickBusy} onClick={() => onQuickComplete(a)}>{t('quickCompletePaid')}</button>
      <button className="btn btn-secondary btn-small" onClick={() => setFailedAppointment(a)}>{t('appointmentFailure')}</button><button className="btn btn-secondary btn-small" onClick={() => setEmailAppointment(a)}>{t('appointmentEmailTitle')}</button>
      <button className="icon-btn" title={t('editAppointment')} aria-label={t('editAppointment')} onClick={() => onEdit(a)}><Pencil size={17}/></button>
      <button className="icon-btn" title={t('copyConfirmation')} aria-label={t('copyConfirmation')} onClick={() => void copy(a)}><Copy size={17}/></button>
      <button className="icon-btn" title={t('addToCalendar')} aria-label={t('addToCalendar')} onClick={() => ics(a)}><CalendarPlus size={17}/></button>
      <button className="icon-btn danger" title={t('cancelAppointment')} aria-label={t('cancelAppointment')} onClick={() => cancel(a)}><X size={17}/></button></> : <span className="tag-chip">{t(a.status)}</span>}</div>}/>) : <Empty icon={<CalendarDays size={28}/>} title={t('noAppointments')} text={t('noAppointmentsText')} action={<button className="btn btn-secondary" onClick={onNew}>{t('newAppointment')}</button>}/>}</section>}
    {mode === 'list' && appointments.length > limit && <button type="button" className="btn btn-secondary" onClick={()=>setLimit(n=>n+100)}>{t('showMoreRows')}</button>}
    <WaitlistPanel vault={vault}/>
    {mode === 'list' && <AvailabilityList vault={vault} filter={filter} onEdit={setAbsenceForm}/>}
    {failedAppointment && <AppointmentFailure vault={vault} appointment={failedAppointment} onClose={() => setFailedAppointment(undefined)}/>}
    {emailAppointment && <AppointmentEmail vault={vault} appointment={emailAppointment} onClose={() => setEmailAppointment(undefined)}/>}
    {absenceForm && <AvailabilityForm vault={vault} absence={absenceForm === 'new' ? undefined : absenceForm} onClose={() => setAbsenceForm(undefined)} onSaved={absence => { setAbsenceForm(undefined); setWeekFocusDate(absence.fromDate); setMode('week'); }}/>}
    {exporting && <Modal title={t('exportCalendar')} onClose={() => setExporting(false)}><Notice error>{t('exportCalendarHint')}</Notice><div className="form-actions"><button className="btn btn-secondary" onClick={() => exportCalendar(false)}>{t('withoutNames')}</button><button className="btn btn-primary" onClick={() => exportCalendar(true)}>{t('withNames')}</button></div></Modal>}
  </>;
}
