import { InvoiceChecks } from './InvoiceChecks';
import { PracticeCard } from './PracticeCard';
import { ClientForm } from './forms';
import { runSecureTask } from '../lib/workerTasks';
import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Printer, Download, Leaf, Mail, Send } from 'lucide-react';
import { downloadDocument, validEmail } from '../lib/documents';
import { invoiceFilename } from '../lib/invoiceMessage';
import { EmailComposer } from './documents';
import { TelegramComposer } from './telegram';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { dateLabel, money, today } from '../lib/dates';
import { attachInvoice, billingConflicts, buildInvoice, cancellationOf, incomeCsv, invoiceOutstanding, invoiceOverdue, invoicePaymentTerm, invoiceTitleKey, isCancellation, paidOn, uninvoiced } from '../lib/invoice';
import { downloadText } from '../lib/files';
import { duplicateInvoiceNumbers } from '../lib/merge';
import { uid, type ClientDocument, type Currency, type ExchangeRate, type Invoice, type Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { bankFor, currencyOf } from '../lib/currency';
import { BillingMoney, ExchangeRateField } from './money';
import { Field, Modal, Notice } from './ui';
import { InvoiceRevisionDialog } from './invoice-revision';
import { practiceToday } from '../lib/followUp';

/** The printable document. It is rendered once on screen (preview) and once into #print-root for the print dialog. */
export function InvoiceSheet({ invoice, paid }: { invoice: Invoice; paid: string | null }) {
  const l = invoice.language; const T = (key: TextKey) => translate(l, key); const p = invoice.sender; const currency = invoice.currency ?? 'EUR'; const account = invoice.paymentAccount ?? bankFor(p, currency);
  const date = (iso: string) => dateLabel(iso, l, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const reference = invoice.cancels ?? invoice.replaces;
  const relation = reference && T(invoice.cancels ? 'invoiceCancels' : 'invoiceReplaces').replace('{number}', reference.number).replace('{date}', date(reference.issuedAt));
  return <article className="invoice-sheet" lang={l}>
    <header className="invoice-header"><div className="invoice-brand"><Leaf size={30} strokeWidth={1.4} aria-hidden="true"/><div className="invoice-sender"><strong>{p.name}</strong><span className="pre-line">{p.address}</span>{p.taxId && <span>{T('invoiceTaxId')}: {p.taxId}</span>}</div></div><div className="invoice-heading"><h1>{T(invoiceTitleKey(invoice))}</h1><dl className="invoice-meta"><div><dt>{T('invoiceNumber')}</dt><dd>{invoice.number}</dd></div><div><dt>{T('invoiceDate')}</dt><dd>{date(invoice.issuedAt)}</dd></div>{invoice.dueOn && !isCancellation(invoice) && <div><dt>{T('invoiceDueOn')}</dt><dd>{invoicePaymentTerm(invoice)}</dd></div>}</dl></div></header>
    <section className="invoice-recipient"><small>{T('invoiceRecipient')}</small><strong>{invoice.recipient.name}</strong><span className="pre-line">{invoice.recipient.address}</span></section>
    {relation && <p className="invoice-reference">{relation}{invoice.correctionReason && <span className="pre-line">{invoice.correctionReason}</span>}</p>}
    <table><colgroup><col className="invoice-date-column"/><col/><col className="invoice-amount-column"/></colgroup><thead><tr><th>{T('invoiceServiceDate')}</th><th>{T('invoiceItem')}</th><th className="num">{T('invoiceAmount')}</th></tr></thead>
      <tbody>{invoice.lines.map(line => <tr key={line.sessionId}><td>{date(line.date)}</td><td>{line.description}</td><td className="num">{money(line.amountCents, l, currency)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>{T('invoiceTotal')}</td><td className="num">{money(invoice.totalCents, l, currency)}</td></tr></tfoot></table>
    {p.taxNote && <p className="pre-line invoice-tax-note">{p.taxNote}</p>}
    {isCancellation(invoice) ? <section className="invoice-payment"><p>{T('invoiceCancellationNote')}</p></section> : paid ? <section className="invoice-payment invoice-paid"><p>{T('invoicePaid').replace('{date}', date(paid))}</p></section> : (account.iban && <section className="invoice-payment"><h2>{T('invoicePaymentDetails')}</h2><p>{T('invoicePayTo')}</p><dl>{account.holder && <div><dt>{T('accountHolder')}</dt><dd>{account.holder}</dd></div>}<div><dt>IBAN</dt><dd><strong>{account.iban}</strong></dd></div>{account.bank && <div><dt>{T('invoiceBank')}</dt><dd>{account.bank}</dd></div>}{account.bic && <div><dt>BIC / SWIFT</dt><dd>{account.bic}</dd></div>}<div><dt>{T('invoiceReference')}</dt><dd>{invoice.number}</dd></div></dl></section>)}
    <footer className="invoice-footer">{T('invoiceThanks')}</footer>
  </article>;
}
export function InvoiceView({ vault, invoice: initialInvoice, onClose }: { vault: VaultController; invoice: Invoice; onClose: () => void }) {
  const { t, language } = useI18n(); const [currentId, setCurrentId] = useState(initialInvoice.id); const invoice = vault.data!.invoices.find(i => i.id === currentId) ?? initialInvoice;
  const paid = paidOn(vault.data!, invoice); const root = document.getElementById('print-root');
  const cancelled = cancellationOf(vault.data!, invoice.id); const outstanding = invoiceOutstanding(vault.data!, invoice); const [revision, setRevision] = useState<'cancel' | 'correct'>();
  const related = vault.data!.invoices.filter(i => i.id === invoice.cancels?.id || i.id === invoice.replaces?.id || i.replaces?.id === invoice.id || i.cancels?.id === invoice.id);
  const conflict = billingConflicts(vault.data!).includes(invoice.number);
  const client = vault.data!.clients.find(c => c.id === invoice.clientId);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  const [composer, setComposer] = useState<{ kind: 'email' | 'telegram'; id: string; purpose: 'invoice' | 'paymentReminder' }>();
  const copies = vault.data!.documents.filter(d => d.invoiceId === invoice.id);
  const when = (value: string) => new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  async function prepare(kind: 'download' | 'email' | 'telegram', purpose: 'invoice' | 'paymentReminder' = 'invoice') {
    if (busy || !client) return; setBusy(true); setError(undefined); let added: string | undefined;
    try {
      if (kind !== 'download' && cancelled) throw new Error('invoiceInactive');
      if (purpose === 'paymentReminder' && (!(outstanding && outstanding > 0) || conflict)) throw new Error('invoiceReminderUnavailable');
      let copy = copies.find(d => d.invoicePaidOn === paid);
      if (!copy) {
        const bytes = await runSecureTask('invoice', { invoice, paid });
        added = await vault.addFile(bytes);
        copy = { id: uid(), clientId: client.id, title: `${translate(invoice.language, invoiceTitleKey(invoice))} ${invoice.number}`, createdAt: new Date().toISOString(), invoiceId: invoice.id, invoicePaidOn: paid, language: invoice.language, returnExpected: false, deliveries: [], returns: [], file: { blobId: added, fileName: invoiceFilename(invoice), mimeType: 'application/pdf', size: bytes.byteLength } } satisfies ClientDocument;
        const stored = copy; await vault.update(d => { d.documents.push(stored); }); added = undefined;
      }
      if (kind === 'download') downloadDocument(await vault.file(copy.file.blobId, copy.file.mimeType), copy.file.fileName);
      else setComposer({ kind, id: copy.id, purpose });
    } catch (e) { if (added) await vault.purgeUnused([added]).catch(() => {}); setError(e instanceof Error && ['invoicePdfError', 'invoiceInactive', 'invoiceReminderUnavailable', 'workerUnavailable', 'workerFailed'].includes(e.message) ? e.message as TextKey : 'storageError'); }
    finally { setBusy(false); }
  }
  return <Modal title={`${t(invoiceTitleKey(invoice))} ${invoice.number}`} onClose={() => { if (!busy) onClose(); }} wide>
    {invoice.currency === 'UAH' && invoice.totalEuroCents !== undefined && <Notice>{t('invoiceInternalEuro')}: ≈ {money(invoice.totalEuroCents, invoice.language)}</Notice>}
    {cancelled && <Notice>{t('invoiceCancelled')} · <button className="text-link" onClick={() => setCurrentId(cancelled.id)}>{t('cancellationTitle')} {cancelled.number}</button></Notice>}
    {isCancellation(invoice) && invoice.paymentSnapshot?.some(s => s.paidAt) && <Notice>{t('invoiceRefundHint')}</Notice>}
    {conflict && <Notice error>{t('invoiceWorkflowConflict')}</Notice>}
    {related.length > 0 && <div className="invoice-relations">{related.map(i => <button key={i.id} className="text-link" onClick={() => { setCurrentId(i.id); setError(undefined); }}>{t(invoiceTitleKey(i))} {i.number}</button>)}</div>}
    <InvoiceSheet invoice={invoice} paid={paid}/>
    <p className="hint">{t('invoicePrintHint')}</p><p className="hint">{t('invoiceArchived')}</p>
    {!validEmail(client?.email ?? '') && <p className="hint">{t('clientEmailMissing')}</p>}
    {copies.some(d => d.deliveries.length || d.telegramDeliveries?.length) && <div className="invoice-send-history">{copies.flatMap(d => [...d.deliveries.map(x => <p className="hint" key={x.id}>{x.purpose === 'paymentReminder' && `${t('invoiceReminderTitle')} · `}{t(x.acceptedAt ? 'documentSentOn' : 'documentNotSent')} · {when(x.acceptedAt ?? x.requestedAt)} · {x.recipient}</p>), ...(d.telegramDeliveries ?? []).map(x => <p className="hint" key={x.id}>{x.purpose === 'paymentReminder' && `${t('invoiceReminderTitle')} · `}{t(x.acceptedAt ? 'telegramSentOn' : 'telegramNotSent')} · {when(x.acceptedAt ?? x.requestedAt)} · {x.recipient}</p>)])}</div>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions invoice-actions"><button className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button><button className="btn btn-secondary" disabled={busy || !client} onClick={() => void prepare('download')}><Download size={17}/>{t(busy ? 'working' : 'invoiceDownload')}</button><button className="btn btn-secondary" disabled={busy} onClick={() => window.print()}><Printer size={17}/>{t('printInvoice')}</button><button className="btn btn-primary" disabled={busy || !!cancelled || conflict || !validEmail(client?.email ?? '')} onClick={() => void prepare('email')}><Mail size={17}/>{t('invoiceEmail')}</button><button className="btn btn-primary" disabled={busy || !!cancelled || conflict || !client} onClick={() => void prepare('telegram')}><Send size={17}/>{t('invoiceTelegram')}</button></div>
    {!isCancellation(invoice) && !cancelled && <div className="invoice-workflow-actions"><button className="btn btn-secondary" disabled={busy || conflict} onClick={() => setRevision('correct')}>{t('invoiceCorrect')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setRevision('cancel')}>{t('invoiceCancel')}</button></div>}
    {!isCancellation(invoice) && !cancelled && outstanding !== null && outstanding > 0 && <section className="invoice-reminder"><h3>{t('invoiceReminderTitle')} · {money(outstanding, language, invoice.currency ?? 'EUR')}</h3><p className="hint">{t('invoiceReminderHint')}</p><div className="button-row"><button className="btn btn-secondary" disabled={busy || conflict || !validEmail(client?.email ?? '')} onClick={() => void prepare('email', 'paymentReminder')}><Mail size={16}/>{t('invoiceReminder')} · E-Mail</button><button className="btn btn-secondary" disabled={busy || conflict || !client} onClick={() => void prepare('telegram', 'paymentReminder')}><Send size={16}/>{t('invoiceReminder')} · Telegram</button></div></section>}
    {!cancelled && !isCancellation(invoice) && <InvoiceChecks source={invoice} issued onFix={() => setRevision('correct')}/>}
    {root && createPortal(<InvoiceSheet invoice={invoice} paid={paid}/>, root)}
    {revision && <InvoiceRevisionDialog key={invoice.id} vault={vault} invoice={invoice} correct={revision === 'correct'} onClose={() => setRevision(undefined)} onSaved={next => { setRevision(undefined); setCurrentId(next.id); setError(undefined); }}/>}
    {composer && client && (composer.kind === 'email' ? <EmailComposer vault={vault} client={client} documentId={composer.id} purpose={composer.purpose} onClose={() => setComposer(undefined)}/> : <TelegramComposer vault={vault} client={client} documentId={composer.id} purpose={composer.purpose} onClose={() => setComposer(undefined)}/>)}
  </Modal>;
}
export function InvoiceForm({ vault, clientId, onClose, onCreated }: { vault: VaultController; clientId?: string; onClose: () => void; onCreated: (invoice: Invoice) => void }) {
  const { t, language } = useI18n(); const data = vault.data!;
  const [selected, setSelected] = useState(clientId || data.clients.find(c => uninvoiced(data, c.id).length)?.id || data.clients[0]?.id || '');
  const client = data.clients.find(c => c.id === selected); const open = client ? uninvoiced(data, client.id) : [];
  const [fix, setFix] = useState<'client' | 'practice' | 'banks'>();
  const [chosen, setChosen] = useState<string[] | null>(null); const ids = chosen ?? open.map(s => s.id);
  const [issuedAt, setIssuedAt] = useState(today()); const [dueOn, setDueOn] = useState(issuedAt); const [dueTouched, setDueTouched] = useState(false); const [lang, setLang] = useState<Language>(client?.language ?? language);
  const [currency, setCurrency] = useState<Currency>(currencyOf(client)); const [rate, setRate] = useState<ExchangeRate | undefined>(data.settings.exchangeRate);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  let preview: Invoice | undefined;
  try { if (client && issuedAt && ids.length) preview = buildInvoice(data, client, open.filter(s => ids.includes(s.id)), issuedAt, lang, 'preview', { currency, rate, dueOn }); } catch { /* Incomplete input is validated on submit. */ }
  function pick(id: string) { setSelected(id); setChosen(null); const c = data.clients.find(x => x.id === id); if (c) { setLang(c.language); setCurrency(currencyOf(c)); } }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!client || !ids.length || !issuedAt) { setError('required'); return; }
    setBusy(true); setError(undefined);
    try {
      const invoice = buildInvoice(data, client, open.filter(s => ids.includes(s.id)), issuedAt, lang, uid(), { currency, rate, dueOn });
      await vault.update(d => { attachInvoice(d, invoice); if (currency === 'UAH' && rate) d.settings.exchangeRate = rate; });
      onCreated(invoice);
    } catch (err) { setError(err instanceof Error && ['rateRequired', 'invalidInvoiceDate', 'invoiceWorkflowConflict'].includes(err.message) ? err.message as TextKey : 'required'); } finally { setBusy(false); }
  }
  return <Modal title={t('createInvoice')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} noValidate>
    <Field label={t('client')}><select value={selected} onChange={e => pick(e.target.value)}>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <fieldset className="check-list"><legend>{t('invoiceSessions')}</legend>{open.length ? open.map(s => <label className="check-label" key={s.id}><input type="checkbox" checked={ids.includes(s.id)} onChange={e => setChosen(e.target.checked ? [...ids, s.id] : ids.filter(x => x !== s.id))}/><span>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })} · <BillingMoney feeCents={s.feeCents} billing={s.billing}/></span></label>) : <p className="hint">{t('noUninvoiced')}</p>}</fieldset>
    <div className="form-grid"><Field label={t('invoiceDate')}><input type="date" value={issuedAt} onChange={e => { setIssuedAt(e.target.value); if (!dueTouched && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDueOn(e.target.value); }}/></Field>
      <Field label={t('invoiceLanguage')}><select value={lang} onChange={e => setLang(e.target.value as Language)}><option value="de">Deutsch</option><option value="uk">Українська</option></select></Field></div>
    <Field label={t('invoiceDueOn')} hint={t('invoiceDueHint')}><input type="date" min={issuedAt} value={dueOn} onChange={e => { setDueOn(e.target.value); setDueTouched(true); }}/></Field>
    <Field label={t('invoiceCurrency')} hint={t('invoiceCurrencyHint')}><select value={currency} onChange={e => setCurrency(e.target.value as Currency)}><option value="EUR">{t('currencyEur')}</option><option value="UAH">{t('currencyUah')}</option></select></Field>
    {currency === 'UAH' && <><ExchangeRateField value={rate} onChange={setRate}/><p className="hint">{t('invoiceRateHint')}</p></>}
    {preview && <div className="currency-preview" aria-live="polite"><div><span>{t('payableAmount')}</span><strong>{money(preview.totalCents, language, currency)}</strong>{currency === 'UAH' && preview.totalEuroCents !== undefined && <small>≈ {money(preview.totalEuroCents, language)} · {t('euroComparisonOnly')}</small>}</div></div>}
    {client && <InvoiceChecks source={{ recipient: { name: client.name, address: client.address ?? '' }, sender: data.settings.practice, currency }} onFix={setFix}/>}
    {fix === 'client' && client && <ClientForm vault={vault} client={client} onClose={() => setFix(undefined)} onSaved={() => setFix(undefined)}/>}
    {(fix === 'practice' || fix === 'banks') && <Modal title={t('practiceProfile')} onClose={() => setFix(undefined)}><PracticeCard vault={vault} focus={fix} currency={currency}/><div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setFix(undefined)}>{t('close')}</button></div></Modal>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy || !ids.length}><FileText size={17}/>{t('createInvoice')}</button></div>
  </form></Modal>;
}
export function InvoiceList({ vault, onOpen }: { vault: VaultController; onOpen: (invoice: Invoice) => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const duplicates = duplicateInvoiceNumbers(data); const conflicts = billingConflicts(data); const [filter, setFilter] = useState('all'); const reference = practiceToday(data.settings);
  const list = [...data.invoices].filter(i => filter === 'all' || (filter === 'cancelled' ? isCancellation(i) || !!cancellationOf(data, i.id) : filter === 'overdue' ? invoiceOverdue(data, i, reference) : filter === 'paid' ? !isCancellation(i) && !cancellationOf(data, i.id) && paidOn(data, i) : (invoiceOutstanding(data, i) ?? 0) > 0)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.number.localeCompare(a.number));
  return <section className="card invoice-list"><div className="section-heading flex-wrap"><div><h2>{t('invoices')}</h2><p>{t('invoicesHint')}</p></div><Field label={t('invoiceStatusFilter')}><select value={filter} onChange={e => setFilter(e.target.value)}>{['all','paid','unpaid','overdue','cancelled'].map(f => <option value={f} key={f}>{t(f === 'overdue' ? 'invoiceOverdue' : f === 'cancelled' ? 'invoiceCancelled' : f as 'all' | 'paid' | 'unpaid')}</option>)}</select></Field></div>
    {duplicates.length > 0 && <Notice error>{t('invoiceDuplicate')} {duplicates.join(', ')}</Notice>}
    {conflicts.length > 0 && <Notice error>{t('invoiceWorkflowConflict')} {conflicts.join(', ')}</Notice>}
    {list.length ? <div className="table-scroll"><table><thead><tr><th>{t('invoiceNumber')}</th><th>{t('invoiceDate')}</th><th>{t('client')}</th><th>{t('invoiceTotal')}</th><th>{t('invoiceDueOn')}</th><th>{t('paymentStatus')}</th></tr></thead>
      <tbody>{list.map(i => { const paid = paidOn(data, i); const cancelled = isCancellation(i) || !!cancellationOf(data, i.id); const outstanding = invoiceOutstanding(data, i); const key: TextKey = isCancellation(i) ? 'cancellationTitle' : cancelled ? 'invoiceCancelled' : outstanding === null ? 'invoiceUnknownPayment' : paid ? 'paid' : invoiceOverdue(data, i, reference) ? 'invoiceOverdue' : 'invoiceOpenBalance';
        return <tr key={i.id}><td><button className="table-client" aria-label={`${t('invoiceOpen')} ${i.number}`} onClick={() => onOpen(i)}>{i.number}</button>{i.replaces && <small className="session-clock">↳ {i.replaces.number}</small>}</td><td>{dateLabel(i.issuedAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td><td>{i.recipient.name}</td><td className="tabular-nums font-semibold">{money(i.totalCents, language, i.currency ?? 'EUR')}{i.currency === 'UAH' && i.totalEuroCents !== undefined && <small className="euro-secondary">≈ {money(i.totalEuroCents, language)}</small>}</td><td>{invoicePaymentTerm(i, language)}</td><td><span className={`payment-badge ${cancelled ? 'is-voided' : paid ? 'is-paid' : 'is-unpaid'}`}>{t(key)}</span></td></tr>; })}</tbody></table></div>
      : <p className="hint">{t(data.invoices.length ? 'invoiceNoResults' : 'invoiceNone')}</p>}</section>;
}
export function CsvExport({ vault, year, onClose }: { vault: VaultController; year: number; onClose: () => void }) {
  const { t, language } = useI18n(); const [names, setNames] = useState(false);
  return <Modal title={t('exportCsv')} onClose={onClose}><Notice error>{t('csvHint')}</Notice>
    <label className="check-label"><input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)}/><span>{t('csvWithNames')}</span></label>
    <div className="form-actions"><button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" onClick={() => { downloadText(`einnahmen-${year}.csv`, incomeCsv(vault.data!, year, names, language), 'text/csv'); onClose(); }}><Download size={17}/>{t('exportCsv')} · {year}</button></div></Modal>;
}
