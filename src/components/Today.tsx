import { ArrowRight, CalendarDays, Check, CircleDollarSign, Plus, TrendingUp, Users } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { dateLabel, money, monthlyIncome, byStart } from '../lib/dates';
import { practiceToday } from '../lib/followUp';
import { appointmentView } from '../lib/zones';
import { clientStatus } from '../lib/clientStatus';
import { isSessionVoided } from '../lib/invoice';
import type { Appointment } from '../lib/types';
import type { FinanceView } from '../lib/finance';
import type { WorkItem } from '../lib/workItems';
import type { VaultController } from '../lib/useVault';
import { AppointmentRow } from './appointments';
import { FollowUpBoard, OverdueInvoiceList } from './follow-up';
import { WorkBoard } from './WorkBoard';
import { Avatar, PageHeading, TextLink } from './ui';

type Props = {
  vault: VaultController;
  onNewAppointment: () => void;
  onNewClient: () => void;
  onClient: (id: string) => void;
  onClients: () => void;
  onAppointments: () => void;
  onComplete: (appointment: Appointment) => void;
  onPayments: (view: FinanceView) => void;
  onInvoice: (id: string) => void;
  onDocument: (clientId: string, documentId: string) => void;
  onWork: (item: WorkItem) => void;
};

export function Today({ vault, onNewAppointment, onNewClient, onClient, onClients, onAppointments, onComplete, onPayments, onInvoice, onDocument, onWork }: Props) {
  const { t, language } = useI18n(); const data = vault.data!;
  const day = practiceToday(data.settings);
  const activeClients = data.clients.filter(c => clientStatus(c) === 'active');
  const appointments = data.appointments.filter(a => a.status !== 'cancelled').sort(byStart);
  const inPractice = (a: Appointment) => appointmentView(a, data.clients.find(c => c.id === a.clientId), data.settings, language).practice.iso;
  const todayAppointments = appointments.filter(a => inPractice(a) === day);
  const next = appointments.filter(a => a.status === 'scheduled' && inPractice(a) > day);
  const open = data.sessions.filter(s => !s.paidAt && !isSessionVoided(data, s)).reduce((sum, s) => sum + s.feeCents, 0);
  // Keep the existing payment-month calculation identical to the payments page.
  const now = new Date(); const income = monthlyIncome(data.sessions, now.getFullYear())[now.getMonth()];
  const row = (a: Appointment) => <AppointmentRow key={a.id} appointment={a} vault={vault} onClient={onClient} actions={a.status === 'scheduled'
    ? <button className="btn btn-secondary btn-small" onClick={() => onComplete(a)}><Check size={16}/>{t('completeAppointment')}</button>
    : <span className="tag-chip">{t(a.status)}</span>}/>;
  return <>
    <PageHeading title={t('overview')} subtitle={t('overviewSubtitle')}/>
    <div className="today-blocks">
      <section className="card today-appointments" aria-labelledby="today-appointments-title">
        <div className="section-heading"><div><h2 id="today-appointments-title"><CalendarDays size={21}/>{t('appointments')}</h2><p>{t('todayAppointmentsHint')}</p></div><button className="btn btn-primary" onClick={onNewAppointment}><Plus size={18}/>{t('newAppointment')}</button></div>
        <div className="today-links"><TextLink onClick={onAppointments}><CalendarDays size={17}/>{t('goToAppointments')} ({todayAppointments.filter(a => a.status === 'scheduled').length + next.length})</TextLink><TextLink onClick={onClients}><Users size={17}/>{t('goToClients')} ({activeClients.length})</TextLink></div>
        <h3 className="today-subheading">{t('today')} · {dateLabel(day, language, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        {todayAppointments.length ? <div className="appointment-list">{todayAppointments.slice(0, 8).map(row)}</div> : <p className="hint">{t('todayNoAppointments')}</p>}
        <h3 className="today-subheading">{t('nextAppointments')}</h3>
        {next.length ? <div className="appointment-list">{next.slice(0, 4).map(a => <AppointmentRow key={a.id} appointment={a} vault={vault} onClient={onClient}/>)}</div> : <p className="hint">{t('noAppointmentsText')}</p>}
        <TextLink onClick={onAppointments}>{t('allAppointments')}<ArrowRight size={16}/></TextLink>
      </section>
      <section className="card today-payments" aria-labelledby="today-payments-title">
        <div className="section-heading"><div><h2 id="today-payments-title"><CircleDollarSign size={21}/>{t('finances')}</h2><p>{t('todayPaymentsHint')}</p></div><button className="btn btn-primary" onClick={() => onPayments('unpaid')}>{t('goToPayments')}<ArrowRight size={18}/></button></div>
        <div className="today-money-grid">
          <button className="stat-card stat-link" onClick={() => onPayments('unpaid')} aria-label={`${t('openAmount')}: ${money(open, language)}. ${t('goToUnpaid')}`}><span className="stat-icon tone-rose"><CircleDollarSign size={20}/></span><span>{t('openAmount')}</span><strong>{money(open, language)}</strong></button>
          <button className="stat-card stat-link" onClick={() => onPayments('monthIncome')} aria-label={`${t('receivedMonth')}: ${money(income, language)}. ${t('goToMonthIncome')}`}><span className="stat-icon tone-blue"><TrendingUp size={20}/></span><span>{t('receivedMonth')}</span><strong>{money(income, language)}</strong></button>
        </div>
        <OverdueInvoiceList vault={vault} onInvoice={onInvoice}/>
        <WorkBoard vault={vault} scope="invoices" onOpen={onWork}/>
      </section>
    </div>
    <WorkBoard vault={vault} onOpen={onWork}/>
    <FollowUpBoard vault={vault} onDocument={onDocument}/>
    <section className="card today-clients"><div className="section-heading"><h2>{t('yourClients')}</h2><button className="btn btn-secondary" onClick={onNewClient}><Plus size={17}/>{t('newClient')}</button></div>
      <div className="client-summary-list">{activeClients.slice(0, 4).map(c => <button className="client-summary" key={c.id} onClick={() => onClient(c.id)}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{data.sessions.filter(s => s.clientId === c.id).length} {t('sessions')}</small></span><ArrowRight size={16}/></button>)}</div><TextLink onClick={onClients}>{t('allClients')}</TextLink>
    </section>
  </>;
}
