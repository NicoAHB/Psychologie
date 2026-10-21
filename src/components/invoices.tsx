import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Printer, Download } from 'lucide-react';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { dateLabel, money, today } from '../lib/dates';
import { attachInvoice, buildInvoice, incomeCsv, paidOn, uninvoiced } from '../lib/invoice';
import { downloadText } from '../lib/files';
import { duplicateInvoiceNumbers } from '../lib/merge';
import { uid, type Currency, type ExchangeRate, type Invoice, type Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { bankFor, currencyOf } from '../lib/currency';
import { BillingMoney, ExchangeRateField } from './money';
import { Field, Modal, Notice } from './ui';

/** The printable document. It is rendered once on screen (preview) and once into #print-root for the print dialog. */
export function InvoiceSheet({ invoice, paid }: { invoice: Invoice; paid: string | null }) {
  const l = invoice.language; const T = (key: TextKey) => translate(l, key); const p = invoice.sender; const currency = invoice.currency ?? 'EUR'; const account = invoice.paymentAccount ?? bankFor(p, currency);
  const date = (iso: string) => dateLabel(iso, l, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return <article className="invoice-sheet" lang={l}>
    <header><div className="invoice-sender"><strong>{p.name}</strong><span className="pre-line">{p.address}</span>{p.taxId && <span>{T('invoiceTaxId')}: {p.taxId}</span>}</div></header>
    <section className="invoice-recipient"><small>{T('invoiceRecipient')}</small><strong>{invoice.recipient.name}</strong><span className="pre-line">{invoice.recipient.address}</span></section>
    <h1>{T('invoiceTitle')} {invoice.number}</h1>
    <dl className="invoice-meta"><div><dt>{T('invoiceDate')}</dt><dd>{date(invoice.issuedAt)}</dd></div><div><dt>{T('invoiceNumber')}</dt><dd>{invoice.number}</dd></div></dl>
    <table><thead><tr><th>{T('invoiceServiceDate')}</th><th>{T('invoiceItem')}</th><th className="num">{T('invoiceAmount')}</th></tr></thead>
      <tbody>{invoice.lines.map(line => <tr key={line.sessionId}><td>{date(line.date)}</td><td>{line.description}</td><td className="num">{money(line.amountCents, l, currency)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>{T('invoiceTotal')}</td><td className="num">{money(invoice.totalCents, l, currency)}</td></tr></tfoot></table>
    {p.taxNote && <p className="pre-line">{p.taxNote}</p>}
    {paid ? <p>{T('invoicePaid').replace('{date}', date(paid))}</p> : (account.iban && <p>{T('invoicePayTo')}<br/>{account.holder && <>{account.holder}<br/></>}<strong>{account.iban}</strong>{account.bank && ` · ${account.bank}`}{account.bic && <><br/>BIC / SWIFT: {account.bic}</>}<br/>{T('invoiceNumber')}: {invoice.number}</p>)}
  </article>;
}
export function InvoiceView({ vault, invoice, onClose }: { vault: VaultController; invoice: Invoice; onClose: () => void }) {
  const { t } = useI18n(); const paid = paidOn(vault.data!, invoice); const root = document.getElementById('print-root');
  return <Modal title={`${t('invoiceTitle')} ${invoice.number}`} onClose={onClose} wide>
    {invoice.currency === 'UAH' && invoice.totalEuroCents !== undefined && <Notice>{t('invoiceInternalEuro')}: ≈ {money(invoice.totalEuroCents, invoice.language)}</Notice>}
    <InvoiceSheet invoice={invoice} paid={paid}/>
    <p className="hint">{t('invoicePrintHint')}</p>
    <div className="form-actions"><button className="btn btn-secondary" onClick={onClose}>{t('close')}</button><button className="btn btn-primary" onClick={() => window.print()}><Printer size={17}/>{t('printInvoice')}</button></div>
    {root && createPortal(<InvoiceSheet invoice={invoice} paid={paid}/>, root)}
  </Modal>;
}
export function InvoiceForm({ vault, clientId, onClose, onCreated }: { vault: VaultController; clientId?: string; onClose: () => void; onCreated: (invoice: Invoice) => void }) {
  const { t, language } = useI18n(); const data = vault.data!;
  const [selected, setSelected] = useState(clientId || data.clients.find(c => uninvoiced(data, c.id).length)?.id || data.clients[0]?.id || '');
  const client = data.clients.find(c => c.id === selected); const open = client ? uninvoiced(data, client.id) : [];
  const [chosen, setChosen] = useState<string[] | null>(null); const ids = chosen ?? open.map(s => s.id);
  const [issuedAt, setIssuedAt] = useState(today()); const [lang, setLang] = useState<Language>(client?.language ?? language);
  const [currency, setCurrency] = useState<Currency>(currencyOf(client)); const [rate, setRate] = useState<ExchangeRate | undefined>(data.settings.exchangeRate);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  let preview: Invoice | undefined;
  try { if (client && issuedAt && ids.length) preview = buildInvoice(data, client, open.filter(s => ids.includes(s.id)), issuedAt, lang, 'preview', { currency, rate }); } catch { /* Incomplete input is validated on submit. */ }
  function pick(id: string) { setSelected(id); setChosen(null); const c = data.clients.find(x => x.id === id); if (c) { setLang(c.language); setCurrency(currencyOf(c)); } }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!client || !ids.length || !issuedAt) { setError('required'); return; }
    setBusy(true); setError(undefined);
    try {
      const invoice = buildInvoice(data, client, open.filter(s => ids.includes(s.id)), issuedAt, lang, uid(), { currency, rate });
      await vault.update(d => { attachInvoice(d, invoice); if (currency === 'UAH' && rate) d.settings.exchangeRate = rate; });
      onCreated(invoice);
    } catch (err) { setError(err instanceof Error && err.message === 'rateRequired' ? 'rateRequired' : 'required'); } finally { setBusy(false); }
  }
  return <Modal title={t('createInvoice')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={t('client')}><select value={selected} onChange={e => pick(e.target.value)}>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <fieldset className="check-list"><legend>{t('invoiceSessions')}</legend>{open.length ? open.map(s => <label className="check-label" key={s.id}><input type="checkbox" checked={ids.includes(s.id)} onChange={e => setChosen(e.target.checked ? [...ids, s.id] : ids.filter(x => x !== s.id))}/><span>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })} · <BillingMoney feeCents={s.feeCents} billing={s.billing}/></span></label>) : <p className="hint">{t('noUninvoiced')}</p>}</fieldset>
    <div className="form-grid"><Field label={t('invoiceDate')}><input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)}/></Field>
      <Field label={t('invoiceLanguage')}><select value={lang} onChange={e => setLang(e.target.value as Language)}><option value="de">Deutsch</option><option value="uk">Українська</option></select></Field></div>
    <Field label={t('invoiceCurrency')} hint={t('invoiceCurrencyHint')}><select value={currency} onChange={e => setCurrency(e.target.value as Currency)}><option value="EUR">{t('currencyEur')}</option><option value="UAH">{t('currencyUah')}</option></select></Field>
    {currency === 'UAH' && <><ExchangeRateField value={rate} onChange={setRate}/><p className="hint">{t('invoiceRateHint')}</p></>}
    {preview && <div className="currency-preview" aria-live="polite"><div><span>{t('payableAmount')}</span><strong>{money(preview.totalCents, language, currency)}</strong>{currency === 'UAH' && preview.totalEuroCents !== undefined && <small>≈ {money(preview.totalEuroCents, language)} · {t('euroComparisonOnly')}</small>}</div></div>}
    {!bankFor(data.settings.practice, currency).iban && <Notice>{t('bankMissing')}</Notice>}
    {!data.settings.practice.name && <Notice>{t('practiceDisclaimer')}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy || !ids.length}><FileText size={17}/>{t('createInvoice')}</button></div>
  </form></Modal>;
}
export function InvoiceList({ vault, onOpen }: { vault: VaultController; onOpen: (invoice: Invoice) => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const duplicates = duplicateInvoiceNumbers(data);
  const list = [...data.invoices].sort((a, b) => b.number.localeCompare(a.number));
  return <section className="card"><div className="section-heading"><div><h2>{t('invoices')}</h2><p>{t('invoicesHint')}</p></div></div>
    {duplicates.length > 0 && <Notice error>{t('invoiceDuplicate')} {duplicates.join(', ')}</Notice>}
    {list.length ? <div className="table-scroll"><table><thead><tr><th>{t('invoiceNumber')}</th><th>{t('invoiceDate')}</th><th>{t('client')}</th><th>{t('invoiceTotal')}</th><th>{t('paymentStatus')}</th></tr></thead>
      <tbody>{list.map(i => { const paid = paidOn(data, i); return <tr key={i.id}><td><button className="table-client" aria-label={`${t('invoiceOpen')} ${i.number}`} onClick={() => onOpen(i)}>{i.number}</button></td><td>{dateLabel(i.issuedAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td><td>{i.recipient.name}</td><td className="tabular-nums font-semibold">{money(i.totalCents, language, i.currency ?? 'EUR')}{i.currency === 'UAH' && i.totalEuroCents !== undefined && <small className="euro-secondary">≈ {money(i.totalEuroCents, language)}</small>}</td><td><span className={`payment-badge ${paid ? 'is-paid' : 'is-unpaid'}`}>{t(paid ? 'paid' : 'unpaid')}</span></td></tr>; })}</tbody></table></div>
      : <p className="hint">{t('invoiceNone')}</p>}</section>;
}
export function CsvExport({ vault, year, onClose }: { vault: VaultController; year: number; onClose: () => void }) {
  const { t, language } = useI18n(); const [names, setNames] = useState(false);
  return <Modal title={t('exportCsv')} onClose={onClose}><Notice error>{t('csvHint')}</Notice>
    <label className="check-label"><input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)}/><span>{t('csvWithNames')}</span></label>
    <div className="form-actions"><button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" onClick={() => { downloadText(`einnahmen-${year}.csv`, incomeCsv(vault.data!, year, names, language), 'text/csv'); onClose(); }}><Download size={17}/>{t('exportCsv')} · {year}</button></div></Modal>;
}
