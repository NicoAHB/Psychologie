import { BillingMoney } from './money';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ClipboardList, Copy, FileImage, Home, Images, Leaf, LockKeyhole, Pencil as PencilIcon, Plus, Sparkles, Trash2, Wallet } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { dateLabel, money } from '../lib/dates';
import { INSTRUMENTS, history, scoreOf, severityOf } from '../lib/assessments';
import { daysSince, excerpt, homeworkMessage, overviewOf } from '../lib/discussion';
import { copyText } from '../lib/files';
import { appointmentView } from '../lib/zones';
import type { AssessmentKind, Client, PhotoNote, Session } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Avatar, Empty, ImageView, Notice, PaymentBadge } from './ui';
import { AssessmentsSection } from './assessments';
import { DocumentsSection } from './documents';
import { InvoiceForm, InvoiceView } from './invoices';
import { isSessionVoided, uninvoiced } from '../lib/invoice';
import { clockText } from './DualTime';

export type ProfileTab = 'overview' | 'discussed' | 'questionnaires' | 'documents' | 'finances';
export interface ProfileActions {
  onBack: () => void; onEditClient: () => void; onNewSession: () => void; onNewNote: () => void; onNewAppointment: () => void;
  onEditSession: (session: Session) => void; onPhoto: (blobId: string) => void; onPayment: (session: Session) => void; onDeleteNote: (note: PhotoNote) => void;
}
/** Edits are kept in local state and written (encrypted) once typing pauses, instead of re-encrypting the whole vault on every keystroke. */
function PreparationEditor({ vault, client }: { vault: VaultController; client: Client }) {
  const { t, language } = useI18n(); const [value, setValue] = useState(client.preparation);
  const pending = useRef<string | null>(null); const timer = useRef(0); const latest = useRef(vault); latest.current = vault;
  const save = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current === null) return;
    const text = pending.current; pending.current = null;
    void latest.current.update(d => { const c = d.clients.find(x => x.id === client.id); if (c) c.preparation = text; }).catch(() => {});
  }, [client.id]);
  // The text can also change elsewhere (a session form that sets "next time"); follow it unless something is being typed.
  useEffect(() => { if (pending.current === null) setValue(client.preparation); }, [client.preparation]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', save); save(); };
  }, [save]);
  return <textarea lang={language} rows={5} aria-label={t('preparation')} placeholder={t('preparationPlaceholder')} maxLength={30000} value={value} onBlur={save} onChange={e => { setValue(e.target.value); pending.current = e.target.value; window.clearTimeout(timer.current); timer.current = window.setTimeout(save, 700); }}/>;
}
function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) { return <div className="glance-tile"><span className="glance-label">{icon}{label}</span>{children}</div>; }

function Overview({ vault, client, actions, openTab }: { vault: VaultController; client: Client; actions: ProfileActions; openTab: (tab: ProfileTab, tag?: string) => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const o = overviewOf(data, client.id); const [message, setMessage] = useState<string>();
  const next = o.nextAppointment && appointmentView(o.nextAppointment, client, data.settings, language);
  const latest = (['phq9', 'gad7'] as AssessmentKind[]).map(kind => ({ kind, entries: history(data.assessments, client.id, kind) })).filter(g => g.entries.length).sort((a, b) => b.entries.at(-1)!.date.localeCompare(a.entries.at(-1)!.date))[0];
  const photoCount = (s: Session) => data.notes.filter(n => n.sessionId === s.id).length;
  const ago = (date: string) => { const days = daysSince(date); return days === 0 ? t('today') : days === 1 ? t('daysAgoOne') : t('daysAgo').replace('{n}', String(days)); };
  async function copyHomework(s: Session) { setMessage(await copyText(homeworkMessage(client, s, o.nextAppointment, data.settings)) ? t('copiedHomework') : t('copyFailed')); }
  return <>
    <section className="card glance-card" aria-labelledby="glance-title"><div className="section-heading"><h2 id="glance-title">{t('glanceTitle')}</h2></div>
      <div className="glance-grid">
        <Tile icon={<CalendarDays size={15}/>} label={t('nextAppointmentLabel')}>{next ? <><strong>{dateLabel(next.practice.iso, language, { weekday: 'short', day: 'numeric', month: 'short' })}</strong><small>{t('practiceTime')} ({next.practice.tag}): <b>{clockText(next.practice.time, language)}</b></small>{next.differs && <small className="client-line">{t('clientTime')} ({next.client.tag}): <b>{clockText(next.client.time, language)}</b>{next.client.shift ? ` · ${t(next.client.shift > 0 ? 'dayLater' : 'dayEarlier')}` : ''}</small>}</> : <><strong>{t('noNextAppointment')}</strong><button className="text-link" onClick={actions.onNewAppointment}><Plus size={14}/>{t('newAppointment')}</button></>}</Tile>
        <Tile icon={<Check size={15}/>} label={t('lastSessionLabel')}>{o.lastSession ? <><strong>{dateLabel(o.lastSession.date, language, { day: 'numeric', month: 'short', year: 'numeric' })}</strong><small>{ago(o.lastSession.date)}</small></> : <strong>{t('noSessionYet')}</strong>}</Tile>
        <Tile icon={<Wallet size={15}/>} label={t('sessionsTotal')}><strong>{o.sessions.length}</strong>{o.unpaidCents > 0 && <small className="text-rose">{money(o.unpaidCents, language)} {t('openLabel')}</small>}</Tile>
        <Tile icon={<ClipboardList size={15}/>} label={t('latestQuestionnaire')}>{latest ? (() => { const entry = latest.entries.at(-1)!; const total = scoreOf(latest.kind, entry.answers); return <><strong>{t(`${latest.kind}Title` as TextKey).split(' · ')[0]}: {total} / {INSTRUMENTS[latest.kind].max}</strong><small>{t(`sev_${severityOf(latest.kind, total)}` as TextKey)}</small></>; })() : <strong>—</strong>}</Tile>
      </div></section>
    <section className="preparation-card"><div className="section-heading"><div><span className="eyebrow"><Sparkles size={15}/>{t('privateNote')}</span><h2>{t('preparation')}</h2></div></div><p>{t('preparationHint')}</p><PreparationEditor key={client.id} vault={vault} client={client}/><div className="autosave"><LockKeyhole size={13}/>{t(vault.saving ? 'saving' : vault.storageError ? 'storageError' : 'saved')}</div></section>
    <section className="card"><div className="section-heading"><h2><Home size={17}/> {t('homeworkOpen')}</h2></div>
      {o.openHomework.length ? <ul className="homework-list">{o.openHomework.map(s => <li key={s.id}>
        <div><small>{dateLabel(s.date, language, { day: 'numeric', month: 'long' })}</small><p className="pre-line">{s.homework}</p></div>
        <div className="homework-actions"><label className="check-label"><input type="checkbox" checked={false} onChange={() => { void vault.update(d => { const x = d.sessions.find(y => y.id === s.id); if (x) x.homeworkDone = true; }).catch(() => {}); }}/><span>{t('homeworkReviewed')}</span></label>
          <button className="btn btn-secondary btn-small" onClick={() => void copyHomework(s)}><Copy size={15}/>{t('homeworkCopy')}</button><button className="btn btn-ghost btn-small" onClick={() => actions.onEditSession(s)}>{t('editSession')}</button></div></li>)}</ul>
        : <p className="hint">{t('homeworkNone')}</p>}
      {message && <Notice>{message}</Notice>}</section>
    <section className="card"><div className="section-heading"><h2>{t('recentDiscussed')}</h2>{o.sessions.length > 0 && <button className="text-link" onClick={() => openTab('discussed')}>{t('viewAll')}<ArrowRight size={15}/></button>}</div>
      {o.recent.length ? <ul className="recent-list">{o.recent.map(s => <li key={s.id}><button onClick={() => actions.onEditSession(s)} aria-label={`${t('editThisSession')}: ${dateLabel(s.date, language, { day: 'numeric', month: 'long' })}`}>
        <span className="recent-head"><strong>{dateLabel(s.date, language, { day: 'numeric', month: 'long', year: 'numeric' })}</strong>{photoCount(s) > 0 && <span className="tag-chip"><FileImage size={12}/> {t('photoCount').replace('{n}', String(photoCount(s)))}</span>}{s.tags.slice(0, 3).map(tag => <span className="tag-chip" key={tag}>#{tag}</span>)}</span>
        <span className="recent-text">{excerpt(s.notes, 220) || '—'}</span></button></li>)}</ul> : <p className="hint">{t('nothingDiscussedYet')}</p>}
      {o.threads.length > 0 && <><h3 className="mini-heading">{t('recurringThemes')}</h3><div className="tag-filters">{o.threads.map(([tag, count]) => <button key={tag} className="tag-chip" onClick={() => openTab('discussed', tag)}>#{tag} · {count}</button>)}</div></>}</section>
  </>;
}
function Discussed({ vault, client, tag, setTag, actions }: { vault: VaultController; client: Client; tag: string; setTag: (tag: string) => void; actions: ProfileActions }) {
  const { t, language } = useI18n(); const data = vault.data!; const sessionIds = new Set(data.sessions.map(s => s.id));
  const attached = (s: Session) => data.notes.filter(n => n.sessionId === s.id);
  const entries = [...data.sessions.filter(s => s.clientId === client.id).map(s => ({ kind: 'session' as const, date: `${s.date}T${s.time}`, item: s })),
    ...data.notes.filter(n => n.clientId === client.id && !(n.sessionId && sessionIds.has(n.sessionId))).map(n => ({ kind: 'note' as const, date: n.createdAt, item: n }))].sort((a, b) => b.date.localeCompare(a.date));
  const tags = [...new Set(entries.flatMap(e => e.item.tags))];
  return <section className="card timeline-card"><div className="section-heading flex-wrap"><h2>{t('timeline')}</h2></div>
    {tags.length > 0 && <div className="tag-filters" role="group" aria-label={t('filterTags')}><button className={`tag-chip ${!tag ? 'active' : ''}`} onClick={() => setTag('')}>{t('allTags')}</button>{tags.map(value => <button key={value} className={`tag-chip ${tag === value ? 'active' : ''}`} onClick={() => setTag(value)}>#{value}</button>)}</div>}
    {!entries.length ? <Empty icon={<Leaf size={26}/>} title={t('emptyTimeline')} text={t('emptyTimelineText')}/> : <div className="timeline">{entries.filter(e => !tag || e.item.tags.includes(tag)).map(entry => <article className="timeline-entry" key={entry.item.id}>
      <span className={`timeline-dot ${entry.kind === 'note' ? 'dot-beige' : ''}`}>{entry.kind === 'note' ? <FileImage size={15}/> : <Check size={15}/>}</span>
      <div className="timeline-entry-heading"><h3>{t(entry.kind === 'note' ? 'photoNote' : 'session')}</h3><time dateTime={entry.date}>{dateLabel(entry.date.slice(0, 10), language, { day: 'numeric', month: 'long', year: 'numeric' })}{entry.kind === 'session' && ` · ${clockText(entry.item.time, language)}`}</time><span className="entry-actions">{entry.kind === 'session' ? <button className="icon-btn" title={t('editSession')} aria-label={t('editSession')} onClick={() => actions.onEditSession(entry.item)}><PencilIcon size={16}/></button> : <button className="icon-btn danger" title={t('deleteNote')} aria-label={t('deleteNote')} onClick={() => actions.onDeleteNote(entry.item)}><Trash2 size={16}/></button>}</span></div>
      {entry.kind === 'session' ? <>
        {entry.item.notes && <p className="pre-line">{entry.item.notes}</p>}
        {attached(entry.item).length > 0 && <div className="photo-strip">{attached(entry.item).map(n => <button key={n.id} className="note-thumbnail" aria-label={t('viewPhoto')} onClick={() => actions.onPhoto(n.blobId)}><ImageView id={n.blobId} vault={vault} alt={t('photoNote')}/><span>{t('viewPhoto')}<ArrowRight size={15}/></span></button>)}</div>}
        {entry.item.homework && <div className={`homework-note ${entry.item.homeworkDone ? 'is-done' : ''}`}><strong><Home size={14}/> {t('homework')}{entry.item.homeworkDone ? ` · ${t('homeworkReviewed')}` : ''}</strong><p className="pre-line">{entry.item.homework}</p></div>}
        {!entry.item.notes && <button className="text-link" onClick={() => actions.onEditSession(entry.item)}><PencilIcon size={14}/>{t('addSessionNotes')}</button>}</>
        : <><p>{entry.item.caption}</p><button className="note-thumbnail" aria-label={t('viewPhoto')} onClick={() => actions.onPhoto(entry.item.blobId)}><ImageView id={entry.item.blobId} vault={vault} alt={t('photoNote')}/><span>{t('viewPhoto')}<ArrowRight size={15}/></span></button></>}
      {entry.item.tags.length > 0 && <div className="entry-tags">{entry.item.tags.map(value => <button className="tag-chip" key={value} onClick={() => setTag(value)}>#{value}</button>)}</div>}
    </article>)}{tag && !entries.some(e => e.item.tags.includes(tag)) && <p>{t('noTagResults')}</p>}</div>}</section>;
}

function ClientFinances({ vault, client, actions }: { vault: VaultController; client: Client; actions: ProfileActions }) {
  const { t, language } = useI18n(); const data = vault.data!;
  const [creating, setCreating] = useState(false); const [invoiceId, setInvoiceId] = useState<string>();
  const sessions = data.sessions.filter(s => s.clientId === client.id).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const sum = (filter: (s: Session) => boolean) => money(sessions.filter(filter).reduce((total, s) => total + s.feeCents, 0), language);
  const invoice = data.invoices.find(i => i.id === invoiceId);
  return <section className="card client-finances"><div className="section-heading flex-wrap"><div><h2>{t('profileFinances')}</h2><p>{t('allTime')}</p></div><button className="btn btn-secondary btn-small" disabled={!uninvoiced(data, client.id).length} onClick={() => setCreating(true)}>{t('createInvoice')}</button></div>
    <div className="profile-totals">{(['total', 'paid', 'unpaid'] as const).map((label, index) => <div key={label}><span>{t(label)}</span><strong className={index === 2 ? 'text-rose' : ''}>{sum(s => index === 1 ? !!s.paidAt : !isSessionVoided(data, s) && (index === 0 || !s.paidAt))}</strong></div>)}</div>
    <p className="hint">{t('financeCurrencyHint')}</p>
    {sessions.some(s => s.billing?.currency === 'UAH') && <p className="hint">{t('agreedUahTotal')}: <strong>{money(sessions.filter(s => s.billing?.currency === 'UAH' && !isSessionVoided(data, s)).reduce((total, s) => total + s.billing!.amountCents, 0), language, 'UAH')}</strong></p>}
    {sessions.length ? <div className="table-scroll"><table><thead><tr><th>{t('date')}</th><th>{t('invoiceAmount')}</th><th>{t('paymentDate')}</th><th>{t('paymentStatus')}</th><th>{t('invoiceTitle')}</th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}>
      <td>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}<small className="session-clock">{clockText(s.time, language)}</small></td>
      <td><BillingMoney feeCents={s.feeCents} billing={s.billing}/></td><td>{s.paidAt ? dateLabel(s.paidAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</td>
      <td>{isSessionVoided(data, s) ? <span className="payment-badge is-voided">{t('invoiceVoidedCharge')}{s.paidAt ? ` · ${t('paid')}` : ''}</span> : <PaymentBadge session={s} onClick={() => actions.onPayment(s)}/>}</td><td>{s.invoiceId ? <button className="table-client" onClick={() => setInvoiceId(s.invoiceId)}>{data.invoices.find(i => i.id === s.invoiceId)?.number ?? '—'}</button> : '—'}</td>
    </tr>)}</tbody></table></div> : <p className="hint">{t('noSessions')}</p>}
    {creating && <InvoiceForm vault={vault} clientId={client.id} onClose={() => setCreating(false)} onCreated={invoice => { setCreating(false); setInvoiceId(invoice.id); }}/>}
    {invoice && <InvoiceView vault={vault} invoice={invoice} onClose={() => setInvoiceId(undefined)}/>}
  </section>;
}

export function ClientProfile({ vault, client, tab, setTab, tag, setTag, actions, focusDocumentId }: { vault: VaultController; client: Client; tab: ProfileTab; setTab: (tab: ProfileTab) => void; tag: string; setTag: (tag: string) => void; actions: ProfileActions; focusDocumentId?: string }) {
  const { t } = useI18n();
  const tabs: { id: ProfileTab; label: string; icon: ReactNode }[] = [{ id: 'overview', label: t('tabOverview'), icon: <Sparkles size={15}/> }, { id: 'discussed', label: t('tabDiscussed'), icon: <Images size={15}/> }, { id: 'questionnaires', label: t('questionnaires'), icon: <ClipboardList size={15}/> }, { id: 'documents', label: t('clientDocuments'), icon: <FileImage size={15}/> }, { id: 'finances', label: t('finances'), icon: <Wallet size={15}/> }];
  return <div className="profile-content">
    <button className="text-link mobile-only" onClick={actions.onBack}><ChevronLeft size={16}/>{t('allClients')}</button>
    <div className="profile-heading"><Avatar client={client} vault={vault} large/><div><h2>{client.name}</h2><p>{client.contact || t('profile')}</p></div><button className="btn btn-secondary" onClick={actions.onEditClient}>{t('editClient')}</button></div>
    <div className="button-row profile-actions"><button className="btn btn-primary btn-small" onClick={actions.onNewSession}><Plus size={16}/>{t('addSession')}</button><button className="btn btn-secondary btn-small" onClick={actions.onNewNote}><FileImage size={16}/>{t('addNote')}</button><button className="btn btn-secondary btn-small" onClick={actions.onNewAppointment}><CalendarDays size={16}/>{t('newAppointment')}</button></div>
    <div className="profile-tabs" role="tablist" aria-label={t('profileSections')}>{tabs.map(x => <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls="profile-panel" className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>{x.icon}{x.label}</button>)}</div>
    <div role="tabpanel" id="profile-panel" aria-labelledby={`tab-${tab}`} className="profile-panel">
      {tab === 'overview' && <Overview vault={vault} client={client} actions={actions} openTab={(next, nextTag) => { setTag(nextTag ?? ''); setTab(next); }}/>}
      {tab === 'discussed' && <Discussed vault={vault} client={client} tag={tag} setTag={setTag} actions={actions}/>}
      {tab === 'questionnaires' && <AssessmentsSection vault={vault} clientId={client.id}/>}
      {tab === 'documents' && <DocumentsSection vault={vault} client={client} focusId={focusDocumentId}/>}
      {tab === 'finances' && <ClientFinances vault={vault} client={client} actions={actions}/>}
    </div>
  </div>;
}
