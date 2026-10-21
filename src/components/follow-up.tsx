import { useState } from 'react';
import { ArrowRight, Clock3, Files } from 'lucide-react';
import { dateLabel, money } from '../lib/dates';
import { overdueInvoices, pendingReturns } from '../lib/followUp';
import { useI18n } from '../lib/i18n';
import { invoiceOutstanding } from '../lib/invoice';
import type { VaultController } from '../lib/useVault';

export function FollowUpBoard({ vault, onInvoice, onDocument }: { vault: VaultController; onInvoice: (id: string) => void; onDocument: (clientId: string, documentId: string) => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const invoices = overdueInvoices(data); const returns = pendingReturns(data);
  const [allInvoices, setAllInvoices] = useState(false); const [allReturns, setAllReturns] = useState(false);
  const date = (value: string) => dateLabel(value, language, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return <section className="card follow-up-board"><div className="section-heading"><div><h2>{t('followUpTitle')}</h2><p>{t('followUpSubtitle')}</p></div></div><div className="follow-up-grid">
    <section className="follow-up-column follow-up-invoices"><h3><Clock3 size={17}/>{t('followUpInvoices')}<span className="follow-up-count">{invoices.length}</span></h3>
      {!invoices.length ? <p className="hint">{t('followUpNoInvoices')}</p> : <ul>{invoices.slice(0, allInvoices ? undefined : 5).map(invoice => <li key={invoice.id}><div><strong>{invoice.recipient.name}</strong><span>{invoice.number} · {money(invoiceOutstanding(data, invoice)!, language, invoice.currency ?? 'EUR')}</span><small className="workflow-chip is-overdue">{t('invoiceDueOn')} {date(invoice.dueOn!)}</small></div><button className="btn btn-secondary btn-small" onClick={() => onInvoice(invoice.id)} aria-label={`${t('invoiceOpen')} ${invoice.number}`}><ArrowRight size={17}/><span>{t('invoiceOpen')}</span></button></li>)}</ul>}
      {invoices.length > 5 && <button className="text-link" onClick={() => setAllInvoices(!allInvoices)}>{t(allInvoices ? 'followUpShowLess' : 'followUpShowMore')}</button>}
    </section>
    <section className="follow-up-column follow-up-returns"><h3><Files size={17}/>{t('followUpReturns')}<span className="follow-up-count">{returns.length}</span></h3>
      {!returns.length ? <p className="hint">{t('followUpNoReturns')}</p> : <ul>{returns.slice(0, allReturns ? undefined : 5).map(({ document: doc, status }) => <li key={doc.id}><div><strong>{data.clients.find(c => c.id === doc.clientId)?.name}</strong><span>{doc.title}</span><small className={`workflow-chip ${status === 'overdue' ? 'is-overdue' : ''}`}>{t(status === 'notSent' ? 'returnNotSent' : status === 'overdue' ? 'returnOverdue' : 'returnWaiting')}</small><small>{doc.returnDueOn ? `${t('returnDueLabel')} ${date(doc.returnDueOn)}` : t('returnNoDue')}</small></div><button className="btn btn-secondary btn-small" onClick={() => onDocument(doc.clientId, doc.id)} aria-label={`${t('followUpDocumentOpen')}: ${doc.title}`}><ArrowRight size={17}/><span>{t('followUpDocumentOpen')}</span></button></li>)}</ul>}
      {returns.length > 5 && <button className="text-link" onClick={() => setAllReturns(!allReturns)}>{t(allReturns ? 'followUpShowLess' : 'followUpShowMore')}</button>}
    </section>
  </div></section>;
}
