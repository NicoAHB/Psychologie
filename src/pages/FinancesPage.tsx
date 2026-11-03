import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowRight, Clock3, Download, FileText, TrendingUp, Wallet } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { financeRows, type FinanceView, type PaymentFilter } from '../lib/finance';
import { dateLabel, localeFor, money, monthlyIncome } from '../lib/dates';
import type { Invoice, Session } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { CurrencyTotals } from '../components/CurrencyTotals';
import { openPayments, overduePaymentIds, paymentMonth, receiptTotals, currencyTotals } from '../lib/paymentOverview';
import type { Currency } from '../lib/types';
import { isSessionVoided } from '../lib/invoice';
import { OverdueInvoiceList } from '../components/follow-up';
import { CsvExport, InvoiceForm, InvoiceList, InvoiceView } from '../components/invoices';
import { Empty, Notice, PageHeading, PaymentBadge } from '../components/ui';
import { BillingMoney } from '../components/money';
import { IncomeChart } from '../components/IncomeChart';
import { TaxOverview } from '../components/TaxOverview';
import { HelpButton } from '../components/HelpButton';

function Stat({ icon, label, value, tone, detail, onClick, linkLabel }: { icon: ReactNode; label: string; value: string; tone: string; detail?: string; onClick?: () => void; linkLabel?: string }) {
  const content = <><div className={`stat-icon tone-${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</>;
  return onClick ? <button type="button" className="stat-card stat-link" onClick={onClick} aria-label={`${label}: ${value}. ${linkLabel}`} title={linkLabel}>{content}<ArrowRight size={16} className="stat-link-arrow" aria-hidden="true"/></button> : <div className="stat-card">{content}</div>;
}
const ROWS_PER_PAGE = 100;
export function FinancesPage({ vault, onPayment, onClient, initialView = 'year' }: { vault: VaultController; onPayment: (s: Session) => void; onClient: (id: string) => void; initialView?: FinanceView }) {
  const { t, language } = useI18n(); const data = vault.data!; const now = new Date();
  const [year, setYear] = useState(initialView === 'lastMonthIncome' ? Number(paymentMonth(now,-1).slice(0,4)) : now.getFullYear()); const [view, setView] = useState<FinanceView>(initialView);
  const [filter, setFilter] = useState<PaymentFilter>(initialView === 'monthIncome' ? 'paid' : initialView === 'unpaid' ? 'unpaid' : 'all');
  const [chartCurrency,setChartCurrency] = useState<Currency|'comparison'>('EUR');
  const [historyOpen,setHistoryOpen] = useState(initialView !== 'year');
  const [openLimit, setOpenLimit] = useState(30);
  const [invoiceForm, setInvoiceForm] = useState(false); const [viewInvoice, setViewInvoice] = useState<string>(); const [csv, setCsv] = useState(false); const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1); const before = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const last = monthlyIncome(data.sessions, previous.getFullYear())[previous.getMonth()]; const preceding = monthlyIncome(data.sessions, before.getFullYear())[before.getMonth()];
  const comparison = preceding ? `${new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 0, signDisplay: 'always' }).format((last - preceding) / preceding * 100)} % ${t('comparedPrevious')}` : t('noPrevious');
  const yearly = monthlyIncome(data.sessions, year).reduce((a, b) => a + b, 0);
  const yearSessions = data.sessions.filter(s => s.date.startsWith(`${year}-`));
  const allUnpaid = useMemo(() => openPayments(data), [data]);
  const overdueIds = useMemo(() => overduePaymentIds(data), [data]);
  const unpaid = view === 'overdue' ? allUnpaid.filter(s=>overdueIds.has(s.id)) : allUnpaid;
  const open = allUnpaid.reduce((n,s)=>n+s.feeCents,0);
  const isMonth = view === 'monthIncome' || view === 'lastMonthIncome';
  const nativePeriod = isMonth ? paymentMonth(now,view === 'lastMonthIncome' ? -1 : 0) : String(year);
  const monthLabel = dateLabel(`${paymentMonth(now,view === 'lastMonthIncome' ? -1 : 0)}-01`,language,{month:'long',year:'numeric'});
  const nativeReceived = receiptTotals(data.sessions,nativePeriod);
  const rows = financeRows(filter === 'unpaid' ? data.sessions.filter(s=>!isSessionVoided(data,s)) : data.sessions,year,view,filter,now).filter(s=>view!=='overdue'||overdueIds.has(s.id));
  const chooseView = (value:FinanceView) => { setView(value);if(value==='monthIncome'||value==='lastMonthIncome')setYear(Number(paymentMonth(now,value==='lastMonthIncome'?-1:0).slice(0,4)));setFilter(value==='unpaid'||value==='overdue'?'unpaid':value==='year'?'all':'paid');setLimit(ROWS_PER_PAGE);setOpenLimit(30);setHistoryOpen(value!=='year'); };
  const reset = () => { setView('year'); setFilter('all'); setLimit(ROWS_PER_PAGE); };
  const chooseFilter = (next: PaymentFilter) => { if (next !== filter) setView('year'); setFilter(next); setLimit(ROWS_PER_PAGE); };
  return <>
    <PageHeading title={t('financesTitle')} subtitle={t('financesSubtitle')}/>
    <nav className="finance-quick-filters" aria-label={t('paymentQuickFilters')}>{(['year','unpaid','overdue','monthIncome','lastMonthIncome'] as const).map(value=><button type="button" key={value} className={`btn btn-secondary ${view===value?'btn-selected':''}`}  aria-pressed={view===value} onClick={()=>chooseView(value)}>{t(value==='year'?'all':value==='unpaid'?'unpaid':value==='overdue'?'overdue':value==='monthIncome'?'thisMonth':'lastMonthFilter')}</button>)}</nav>
    {(view==='year'||view==='unpaid'||view==='overdue') && <section className="card finance-open" aria-labelledby="open-payments-title">
      <div className="section-heading"><div><h2 id="open-payments-title">{t(view==='overdue'?'overdue':'unpaid')}</h2><p>{t('unpaidFocus')}</p></div><HelpButton topic="finances" text="helpPayments"/><span className="open-payments-total"><CurrencyTotals values={currencyTotals(unpaid)}/></span></div>
      {unpaid.length ? <ul className="open-payment-list">{unpaid.slice(0, openLimit).map(s => { const name = data.clients.find(c => c.id === s.clientId)?.name; return <li key={s.id}><div className="open-payment-person"><button className="table-client" onClick={() => onClient(s.clientId)}>{name}</button>{s.kind === 'cancellationFee' && <small>{t('cancellationFee')}</small>}<span>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {s.time}</span>{s.invoiceId && <button className="text-link" onClick={() => setViewInvoice(s.invoiceId)}>{t('invoiceTitle')} {data.invoices.find(i => i.id === s.invoiceId)?.number}</button>}</div><BillingMoney feeCents={s.feeCents} billing={s.billing}/><button className="btn btn-secondary" onClick={() => onPayment(s)} aria-label={`${t('markPaid')}: ${name} · ${dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}`}>{t('markPaid')}</button></li>; })}</ul> : <p className="hint">{t('noOpenPayments')}</p>}
      {unpaid.length > openLimit && <button className="btn btn-secondary" onClick={() => setOpenLimit(n => n + 30)}>{t('showMoreRows')}</button>}
      <OverdueInvoiceList vault={vault} onInvoice={setViewInvoice}/>
    </section>}
    <h2 className="payments-income-title">{t(isMonth?'receivedMonth':'yearIncome')} · {isMonth?monthLabel:year}</h2>
    <div className="native-income-cards">{(['EUR','UAH'] as const).map(currency=><section key={currency} className="card native-income-card" aria-label={`${t('receivedNative')}: ${currency}`}><h3>{currency}</h3><strong>{money(nativeReceived[currency],language,currency)}</strong><p className="hint">{t('nativeIncomeHint')}</p></section>)}</div>
    <details className="card calm-details finance-comparison"><summary>{t('euroComparison')}</summary><div className="details-body">
    <div className="stats-grid">
      <Stat icon={<ArrowDownLeft size={21}/>} label={t('lastMonth')} value={money(last, language)} tone="sage" detail={comparison}/>
      <Stat icon={<TrendingUp size={21}/>} label={`${t('yearIncome')} ${year}`} value={money(yearly, language)} tone="blue"/>
      <Stat icon={<Wallet size={21}/>} label={`${t('billed')} · ${year}`} value={money(yearSessions.filter(s => !isSessionVoided(data, s)).reduce((n, s) => n + s.feeCents, 0), language)} tone="beige"/>
      <Stat icon={<Clock3 size={21}/>} label={`${t('openAmount')} · ${t('allYears')}`} value={money(open, language)} tone="rose"/>
    </div>
    </div></details>
    <label className="field finance-chart-currency"><span>{t('chartCurrency')}</span><select aria-label={t('chartCurrency')} value={chartCurrency} onChange={e=>setChartCurrency(e.target.value as Currency|'comparison')}><option value="EUR">EUR</option><option value="UAH">UAH</option><option value="comparison">{t('euroComparison')}</option></select></label>
    <IncomeChart sessions={data.sessions} currency={chartCurrency} month={isMonth ? Number(nativePeriod.slice(5,7))-1 : undefined} year={year} onYear={value => { setYear(value); setView('year'); setLimit(ROWS_PER_PAGE); }}/><p className="hint finance-currency-hint">{t('financeCurrencyHint')}</p>
    {view !== 'year' && <Notice>{isMonth ? `${t('monthIncomeFocus')} ${monthLabel}. ${t('monthIncomeFocusHint')}` : t('unpaidFocus')}<button className="text-link" onClick={reset}>{t('showAllFinance')}</button></Notice>}
    <TaxOverview vault={vault} year={year}/>
    <details className="finance-history" open={historyOpen} onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>{t('paymentHistoryTools')}</summary><section className="card finance-records"><div className="section-heading flex-wrap"><div><h2>{t('receipts')} · {isMonth ? monthLabel : view === 'unpaid' ? t('allYears') : year}</h2><p>{t(isMonth ? 'monthIncomeFocusHint' : 'billedHelp')}</p></div><div className="button-row"><div className="segmented-tabs small-tabs">{(['all', 'paid', 'unpaid'] as const).map(f => <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => chooseFilter(f)}>{t(f)}</button>)}</div><button className="btn btn-secondary btn-small" onClick={() => setCsv(true)}><Download size={15}/>{t('exportCsv')}</button></div></div>
    {rows.length ? <><div className="table-scroll"><table><thead><tr><th>{t('client')}</th><th>{t('date')}</th><th>{t('invoiceAmount')}</th><th>{t('paymentDate')}</th><th>{t('paymentStatus')}</th><th>{t('invoiceTitle')}</th></tr></thead><tbody>{rows.slice(0, limit).map(s => <tr key={s.id}>
      <td><button className="table-client" onClick={() => onClient(s.clientId)}>{data.clients.find(c => c.id === s.clientId)?.name}</button></td><td>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
      <td className="tabular-nums font-semibold"><BillingMoney feeCents={s.feeCents} billing={s.billing}/></td><td>{s.paidAt ? dateLabel(s.paidAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</td>
      <td>{isSessionVoided(data, s) ? <span className="payment-badge is-voided">{t('invoiceVoidedCharge')}{s.paidAt ? ` · ${t('paid')}` : ''}</span> : <><PaymentBadge session={s} onClick={() => onPayment(s)}/>{s.paidAt && s.paymentMethod && <small className="payment-method">{t(s.paymentMethod === 'cash' ? 'paymentCash' : 'paymentTransfer')}</small>}</>}</td><td>{s.invoiceId ? <button className="table-client" onClick={() => setViewInvoice(s.invoiceId)}>{data.invoices.find(i => i.id === s.invoiceId)?.number ?? '—'}</button> : '—'}</td>
    </tr>)}</tbody></table></div>{rows.length > limit && <div className="table-more"><span className="hint">{t('rowsShown').replace('{n}', String(Math.min(limit, rows.length))).replace('{total}', String(rows.length))}</span><button type="button" className="btn btn-secondary" onClick={() => setLimit(n => n + ROWS_PER_PAGE)}>{t('showMoreRows')}</button></div>}</> : <Empty icon={<Wallet size={28}/>} title={t(data.sessions.length ? 'noMatchingFinance' : 'noSessions')} text={t('noSessionsText')} action={data.sessions.length ? <button className="btn btn-secondary" onClick={reset}>{t('showAllFinance')}</button> : undefined}/>}</section>
    </details>
    <div className="invoice-section-actions"><button className="btn btn-secondary" disabled={!data.clients.length} onClick={() => setInvoiceForm(true)}><FileText size={17}/>{t('createInvoice')}</button></div>
    <InvoiceList vault={vault} onOpen={i => setViewInvoice(i.id)}/>
    {invoiceForm && <InvoiceForm vault={vault} onClose={() => setInvoiceForm(false)} onCreated={(i: Invoice) => { setInvoiceForm(false); setViewInvoice(i.id); }}/>}
    {viewInvoice && data.invoices.find(i => i.id === viewInvoice) && <InvoiceView vault={vault} invoice={data.invoices.find(i => i.id === viewInvoice)!} onClose={() => setViewInvoice(undefined)}/>}
    {csv && <CsvExport vault={vault} year={year} onClose={() => setCsv(false)}/>}
  </>;
}
