import { freedSlots } from '../lib/waitlist';
import { useMemo, useRef } from 'react';
import { CalendarDays, Check, Plus, ArrowRight } from 'lucide-react';
import { WaitingNotice } from '../components/Waitlist';
import { SetupChecklist } from '../components/SetupChecklist';
import { HelpButton } from '../components/HelpButton';
import { PaymentMethodField } from '../components/PaymentMethodField';
import { setupItems, type SettingsSection } from '../lib/practiceFlow';
import type { BackupState } from '../lib/backupState';
import type { Appointment, PaymentMethod } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { dateLabel, byStart } from '../lib/dates';
import { practiceToday, overdueInvoices } from '../lib/followUp';
import { appointmentView } from '../lib/zones';
import { clientStatus } from '../lib/clientStatus';
import { nextPracticeAppointment, dailyTasks } from '../lib/dailyOverview';
import { currencyTotals, openPayments, paymentMonth, receiptTotals } from '../lib/paymentOverview';
import type { FinanceView } from '../lib/finance';
import type { WorkItem } from '../lib/workItems';
import type { VaultController } from '../lib/useVault';
import { AppointmentRow } from '../components/appointments';
import { FollowUpBoard, OverdueInvoiceList } from '../components/follow-up';
import { WorkBoard } from '../components/WorkBoard';
import { Avatar, PageHeading, TextLink } from '../components/ui';
import { CurrencyTotals } from '../components/CurrencyTotals';

type Props = {
  vault: VaultController; onWaitlist: () => void; backup?: BackupState | null; onSetup: (section: SettingsSection) => void;
  quickMethod: PaymentMethod; onMethod: (method: PaymentMethod) => void; onQuickComplete: (a: Appointment) => void; quickBusy: boolean;
  onNewAppointment: () => void; onNewClient: () => void; onClient: (id: string) => void; onClients: () => void;
  onAppointments: () => void; onComplete: (appointment: Appointment) => void; onPayments: (view: FinanceView) => void;
  onInvoice: (id: string) => void; onDocument: (clientId: string, documentId: string) => void; onWork: (item: WorkItem) => void;
};
export function Today({ vault, onWaitlist, backup, onSetup, quickMethod, onMethod, onQuickComplete, quickBusy, onNewAppointment, onNewClient, onClient, onClients, onAppointments, onComplete, onPayments, onInvoice, onDocument, onWork }: Props) {
  const { t, language } = useI18n(), data = vault.data!, day = practiceToday(data.settings);
  const allTasks = useRef<HTMLDetailsElement>(null);
  const tasks = useMemo(() => dailyTasks(data), [data, day]);
  const next = nextPracticeAppointment(data), setup = setupItems(data.settings,backup);
  const hasWaiting = data.waitlist.length > 0 && freedSlots(data).length > 0;
  const active = data.clients.filter(c => clientStatus(c) === 'active');
  const appointments = data.appointments.filter(a => a.status !== 'cancelled').sort(byStart);
  const inPractice = (a: Appointment) => appointmentView(a, data.clients.find(c => c.id === a.clientId), data.settings, language).practice.iso;
  const todays = appointments.filter(a => inPractice(a) === day), future = appointments.filter(a => a.status === 'scheduled' && inPractice(a) > day);
  const row = (a: Appointment) => <AppointmentRow key={a.id} appointment={a} vault={vault} onClient={onClient} actions={a.status === 'scheduled' ? <div className="appointment-row-actions"><button className="btn btn-secondary btn-small" onClick={() => onComplete(a)}><Check size={16}/>{t('completeAppointment')}</button><button className="btn btn-secondary btn-small" disabled={quickBusy} onClick={() => onQuickComplete(a)}>{t('quickCompletePaid')}</button></div> : <span className="tag-chip">{t(a.status)}</span>}/>;
  const workLabels = { draft:'draftResume',followUp:'workFollowUp',appointment:'completeAppointment',session:'workDocument',invoice:'workInvoice' } as const;
  return <>
    <PageHeading title={t('overview')} subtitle={dateLabel(day,language,{weekday:'long',day:'numeric',month:'long'})} action={<button className="btn btn-primary" onClick={onNewAppointment}><Plus size={18}/>{t('newAppointment')}</button>}/>
    <div className="today-core"><section className="card today-next" aria-label={t('nextAppointmentLabel')}><div className="section-heading"><div><span className="eyebrow">{t('today')}</span><h2>{t('nextAppointmentLabel')}</h2></div><CalendarDays size={25} aria-hidden="true"/></div>
      {next ? <><AppointmentRow appointment={next} vault={vault} onClient={onClient} actions={<button className="btn btn-secondary" onClick={() => onClient(next.clientId)}>{t('openProfile')}<ArrowRight size={17}/></button>}/></> : <p className="hint">{t('todayNoUpcoming')}</p>}
    </section>
    <section className="card today-priorities" aria-label={t('todayPriorities')}><div className="section-heading"><h2>{t('todayPriorities')}</h2><small>{t('todayPriorityHint')}</small></div>
      {hasWaiting&&<WaitingNotice compact vault={vault} onOpen={onWaitlist}/>}
      {tasks.length ? <ul className="work-list">{tasks.slice(0,hasWaiting?2:3).map(task => <li key={task.id}><div><strong>{data.clients.find(c=>c.id===task.clientId)?.name}</strong><span>{task.type==='work'?t(workLabels[task.item.kind]):t(task.overdue?'returnOverdue':'returnNotSent')} · {dateLabel(task.date,language,{day:'2-digit',month:'2-digit',year:'numeric'})}</span></div><button className="btn btn-secondary" aria-label={`${t('workOpen')}: ${data.clients.find(c=>c.id===task.clientId)?.name}`} onClick={()=>task.type==='work'?onWork(task.item):onDocument(task.clientId,task.documentId)}>{t('workOpen')}<ArrowRight size={16}/></button></li>)}</ul> : !hasWaiting&&<p className="hint">{t('todayNoPriorityTasks')}</p>}
      <TextLink onClick={()=>{if(allTasks.current){allTasks.current.open=true;allTasks.current.querySelector('summary')?.focus();allTasks.current.scrollIntoView({block:'start'});}}}>{t('todayAllTasks')}</TextLink>
    </section>
    <section className="card today-payments" aria-label={t('finances')}><div className="section-heading"><h2>{t('finances')}</h2><button className="btn btn-secondary" onClick={()=>onPayments('unpaid')}>{t('goToPayments')}<ArrowRight size={17}/></button></div><div className="today-money-grid">
      <button className="stat-card stat-link" onClick={()=>onPayments('unpaid')} aria-label={t('goToUnpaid')}><span>{t('openAmount')}</span><CurrencyTotals values={currencyTotals(openPayments(data))}/></button>
      <button className="stat-card stat-link" onClick={()=>onPayments('monthIncome')} aria-label={t('goToMonthIncome')}><span>{t('receivedMonth')}</span><CurrencyTotals values={receiptTotals(data.sessions,paymentMonth())}/></button></div>
      <details className="calm-details"><summary>{t('todayPaymentDetails')} ({overdueInvoices(data).length})</summary><OverdueInvoiceList vault={vault} onInvoice={onInvoice}/><WorkBoard vault={vault} scope="invoices" onOpen={onWork}/></details>
    </section>
    </div><details className="card calm-details today-appointments"><summary>{t('todayAppointmentDetails')} ({todays.length+future.length})</summary><div className="details-body"><div className="quick-payment-controls"><PaymentMethodField quick value={quickMethod} onChange={m=>onMethod(m??'transfer')}/><HelpButton topic="appointments" text="helpAppointments"/></div><h3 className="today-subheading">{dateLabel(day,language,{day:'numeric',month:'long'})}</h3>{todays.length?<div className="appointment-list">{todays.slice(0,8).map(row)}</div>:<p className="hint">{t('todayNoAppointments')}</p>}<h3 className="today-subheading">{t('nextAppointments')}</h3>{future.length?<div className="appointment-list">{future.slice(0,4).map(a=><AppointmentRow key={a.id} appointment={a} vault={vault} onClient={onClient}/>)}</div>:<p className="hint">{t('noAppointmentsText')}</p>}<button className="text-link" aria-label={t('goToAppointments')} onClick={onAppointments}>{t('allAppointments')}<ArrowRight size={16}/></button></div></details>
    <details ref={allTasks} className="card calm-details today-tasks"><summary>{t('todayAllTasks')}</summary><div className="details-body"><WorkBoard vault={vault} onOpen={onWork}/><FollowUpBoard vault={vault} onDocument={onDocument}/></div></details>
    <details className="card calm-details today-clients"><summary>{t('yourClients')} ({active.length})</summary><div className="details-body"><button className="btn btn-secondary" onClick={onNewClient}><Plus size={17}/>{t('newClient')}</button><div className="client-summary-list">{active.slice(0,4).map(c=><button className="client-summary" key={c.id} onClick={()=>onClient(c.id)}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{data.sessions.filter(s=>s.clientId===c.id).length} {t('sessions')}</small></span><ArrowRight size={16}/></button>)}</div><button className="text-link" aria-label={t('goToClients')} onClick={onClients}>{t('allClients')}</button></div></details>
    {!vault.demo && setup.some(item=>!item.done) && <details className="card calm-details today-setup" open={setup.some(item=>!item.optional&&!item.done)}><summary>{t('todaySetupDetails')}</summary><div className="details-body"><SetupChecklist vault={vault} backup={backup} onOpen={onSetup}/></div></details>}
  </>;
}
