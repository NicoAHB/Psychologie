import { translate } from './i18n';
import { bankFor, convertWhole, currencyOf, wholeCents } from './currency';
import { dateLabel, isIsoDay, money } from './dates';
import type { BankAccount, Client, Currency, ExchangeRate, Invoice, Language, PracticeProfile, Session, VaultData } from './types';
import { syncConflicts } from './crdt';

export const validDay = isIsoDay;
export const isCancellation = (invoice: Invoice) => invoice.kind === 'cancellation';
// Issued documents are immutable. Vault writes clone their array; appending a document changes its length.
// Index once per array version so a long practice history never requires nested full invoice scans.
const billingIndexes = new WeakMap<Invoice[], { length: number; cancellations: Map<string, Invoice[]>; coverage: Map<string, Invoice[]>; documents: Map<string, Invoice>; conflicts: Set<string> }>();
function billingIndex(data: VaultData) {
  const cached = billingIndexes.get(data.invoices); if (cached?.length === data.invoices.length) return cached;
  const cancellations = new Map<string, Invoice[]>(); const coverage = new Map<string, Invoice[]>(); const activeNumbers = new Map<string, Invoice[]>();
  const documents = new Map(data.invoices.map(i => [i.id, i])); const children = new Map<string, string[]>(); const conflicts = new Set<string>();
  for (const invoice of data.invoices) if (isCancellation(invoice) && invoice.cancels) { const group = cancellations.get(invoice.cancels.id) ?? []; group.push(invoice); cancellations.set(invoice.cancels.id, group); }
  for (const invoice of data.invoices) {
    const parent = invoice.cancels?.id ?? invoice.replaces?.id; if (parent) { const group = children.get(parent) ?? []; group.push(invoice.id); children.set(parent, group); }
    if (!isCancellation(invoice) && !cancellations.has(invoice.id)) {
      const sameNumber = activeNumbers.get(invoice.number) ?? []; sameNumber.push(invoice); activeNumbers.set(invoice.number, sameNumber);
      for (const line of invoice.lines) { const group = coverage.get(line.sessionId) ?? []; group.push(invoice); coverage.set(line.sessionId, group); }
    }
  }
  for (const [originalId, group] of cancellations) if (group.length > 1) { conflicts.add(originalId); group.forEach(i => conflicts.add(i.id)); }
  for (const group of [...coverage.values(), ...activeNumbers.values()]) if (group.length > 1) group.forEach(i => conflicts.add(i.id));
  const queue = [...conflicts]; for (let index = 0; index < queue.length; index++) for (const id of children.get(queue[index]) ?? []) if (!conflicts.has(id)) { conflicts.add(id); queue.push(id); }
  const index = { length: data.invoices.length, cancellations, coverage, documents, conflicts }; billingIndexes.set(data.invoices, index); return index;
}
export const cancellationOf = (data: VaultData, invoiceId: string) => billingIndex(data).cancellations.get(invoiceId)?.[0];
export const isSessionVoided = (data: VaultData, session: Session) => !!session.invoiceId && !!cancellationOf(data, session.invoiceId);
export const invoiceTitleKey = (invoice: Invoice) => isCancellation(invoice) ? 'cancellationTitle' as const : 'invoiceTitle' as const;

export function invoicePaymentTerm(invoice: Invoice, language: Language = invoice.language): string {
  if (!invoice.dueOn || isCancellation(invoice)) return '—';
  return invoice.dueOn === invoice.issuedAt ? translate(language, 'invoiceDueImmediately') : dateLabel(invoice.dueOn, language, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Next gap-free number of the form `<prefix><year>-001`; counting continues per prefix and year. */
export function nextInvoiceNumber(data: VaultData, issuedAt: string, prefix = data.settings.practice.invoicePrefix): string {
  const year = issuedAt.slice(0, 4); const head = `${prefix}${year}-`;
  const used = data.invoices.map(i => i.number).filter(n => n.startsWith(head)).map(n => Number(n.slice(head.length))).filter(Number.isInteger);
  return `${head}${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}
/** Sessions of a client that no invoice covers yet. */
export const uninvoiced = (data: VaultData, clientId: string) => data.sessions.filter(s => s.clientId === clientId && (!s.invoiceId || isSessionVoided(data, s))).sort((a, b) => a.date.localeCompare(b.date));

export function buildInvoice(data: VaultData, client: Client, sessions: Session[], issuedAt: string, language: Language, id: string, options: { currency?: Currency; rate?: ExchangeRate; dueOn?: string } = {}): Invoice {
  if (!sessions.length) throw new Error('noSessions');
  if (syncConflicts(data).some(c => c.collection === 'settings' && c.field.startsWith('practice.') || c.collection === 'clients' && c.id === client.id && ['name', 'address', 'currency', '$exists'].includes(c.field) || c.collection === 'sessions' && sessions.some(s => s.id === c.id) && ['$amount', 'paidAt', 'date', 'invoiceId', '$exists'].includes(c.field))) throw new Error('invoiceWorkflowConflict');
  const dueOn = options.dueOn ?? issuedAt;
  if (!validDay(issuedAt) || !validDay(dueOn) || dueOn < issuedAt) throw new Error('invalidInvoiceDate');
  const service = data.settings.practice.serviceName.trim() || translate(language, 'invoiceDefaultService');
  const currency = options.currency ?? currencyOf(client);
  const rate = options.rate ?? data.settings.exchangeRate;
  const lines = sessions.map(s => {
    const native = s.billing?.currency === currency;
    const amountCents = native ? wholeCents(s.billing!.amountCents) : convertWhole(s.feeCents, 'EUR', currency, rate);
    const appliedRate = currency === 'UAH' ? (native ? s.billing?.rate : rate) : undefined;
    return { sessionId: s.id, date: s.date, description: s.kind === 'cancellationFee' ? translate(language, 'cancellationFee') : service, amountCents, ...(currency === 'UAH' ? { euroCents: wholeCents(s.feeCents), ...(appliedRate && { rate: { ...appliedRate } }) } : {}) };
  });
  return { id, number: nextInvoiceNumber(data, issuedAt), clientId: client.id, issuedAt, dueOn, lines, totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
    recipient: { name: client.name, address: client.address ?? '' }, sender: structuredClone(data.settings.practice), language, currency, paymentAccount: bankFor(data.settings.practice, currency), ...(currency === 'UAH' ? { totalEuroCents: lines.reduce((sum, line) => sum + (line.euroCents ?? 0), 0) } : {}) };
}
/** Commit the issued currency to the ledger too, including older EUR-only sessions invoiced in UAH. */
export function attachInvoice(data: VaultData, invoice: Invoice) {
  data.invoices.push(invoice);
  if (isCancellation(invoice)) return;
  for (const line of invoice.lines) {
    const session = data.sessions.find(record => record.id === line.sessionId);
    if (!session) continue;
    session.invoiceId = invoice.id;
    session.billing = { currency: invoice.currency ?? 'EUR', amountCents: line.amountCents, ...(line.rate && { rate: { ...line.rate } }) };
  }
}
/** Date of the last payment when every session of the invoice is paid, otherwise null. */
export function paidOn(data: VaultData, invoice: Invoice): string | null {
  if (isCancellation(invoice)) return null;
  const reversed = cancellationOf(data, invoice.id);
  if (!reversed && invoiceOutstanding(data, invoice) === null) return null;
  const paid = invoice.lines.map(line => reversed?.paymentSnapshot ? reversed.paymentSnapshot.find(s => s.sessionId === line.sessionId)?.paidAt ?? null : data.sessions.find(s => s.id === line.sessionId)?.paidAt ?? null);
  return paid.length && paid.every(Boolean) ? paid.sort().at(-1)! : null;
}

/** Outstanding native units, or null when historical sessions no longer permit a reliable payment status. */
export function invoiceOutstanding(data: VaultData, invoice: Invoice): number | null {
  if (isCancellation(invoice) || cancellationOf(data, invoice.id)) return 0;
  if (billingIndex(data).conflicts.has(invoice.id)) return null;
  if (invoiceSyncConflict(data, invoice)) return null;
  if (!invoice.lines.length) return null;
  let total = 0;
  for (const line of invoice.lines) {
    const session = data.sessions.find(s => s.id === line.sessionId);
    if (!session || session.invoiceId && session.invoiceId !== invoice.id) return null;
    if ((billingIndex(data).coverage.get(line.sessionId)?.length ?? 0) > 1) return null;
    const euro = (invoice.currency ?? 'EUR') === 'EUR' ? line.amountCents : line.euroCents;
    if (session.paidAt && euro !== undefined && session.feeCents !== euro) return null;
    if (!session.paidAt) total += line.amountCents;
  }
  return total;
}
export function invoiceOverdue(data: VaultData, invoice: Invoice, reference: string): boolean {
  return !!invoice.dueOn && invoice.dueOn < reference && (invoiceOutstanding(data, invoice) ?? 0) > 0;
}
export function canRemindInvoice(data: VaultData, invoice: Invoice, expectedBalance: number | null): boolean {
  return expectedBalance !== null && expectedBalance > 0 && invoiceOutstanding(data, invoice) === expectedBalance && !billingConflicts(data).includes(invoice.number);
}

export interface InvoiceRevision {
  issuedAt: string; reason: string; cancellationId: string;
  replacement?: { id: string; dueOn: string; language: Language; recipient: Invoice['recipient']; sender: PracticeProfile; paymentAccount: BankAccount; lines: { sessionId: string; description: string; amountCents: number }[] };
}
/** Validate the whole operation first. Then append the reversal and optional replacement in one vault write. */
export function reviseInvoice(data: VaultData, invoiceId: string, revision: InvoiceRevision): { cancellation: Invoice; replacement?: Invoice } {
  const original = data.invoices.find(i => i.id === invoiceId);
  if (!original || isCancellation(original) || cancellationOf(data, invoiceId)) throw new Error('invoiceInactive');
  if (!validDay(revision.issuedAt) || revision.issuedAt < original.issuedAt) throw new Error('invalidInvoiceDate');
  if (!revision.reason.trim() || revision.reason.length > 600 || !revision.cancellationId || data.invoices.some(i => i.id === revision.cancellationId)) throw new Error('required');
  const reference = { id: original.id, number: original.number, issuedAt: original.issuedAt };
  const reversalLines = original.lines.map(line => ({ ...structuredClone(line), amountCents: -line.amountCents, ...(line.euroCents === undefined ? {} : { euroCents: -line.euroCents }) }));
  const cancellation: Invoice = { id: revision.cancellationId, number: nextInvoiceNumber(data, revision.issuedAt, original.sender.invoicePrefix), clientId: original.clientId, issuedAt: revision.issuedAt,
    kind: 'cancellation', cancels: reference, correctionReason: revision.reason.trim(), paymentSnapshot: original.lines.map(line => ({ sessionId: line.sessionId, paidAt: data.sessions.find(s => s.id === line.sessionId)?.paidAt ?? null })), lines: reversalLines, totalCents: -original.totalCents, recipient: structuredClone(original.recipient), sender: structuredClone(original.sender), language: original.language,
    currency: original.currency, ...(original.paymentAccount && { paymentAccount: structuredClone(original.paymentAccount) }), ...(original.totalEuroCents === undefined ? {} : { totalEuroCents: -original.totalEuroCents }) };
  let replacement: Invoice | undefined;
  const changedFees = new Map<string, number>();
  const draft = revision.replacement;
  if (draft) {
    if (!draft.id || draft.id === revision.cancellationId || data.invoices.some(i => i.id === draft.id) || !validDay(draft.dueOn) || draft.dueOn < revision.issuedAt || !draft.recipient.name.trim() || draft.lines.length !== original.lines.length || new Set(draft.lines.map(l => l.sessionId)).size !== original.lines.length) throw new Error('required');
    const anyPaid = original.lines.some(line => !!data.sessions.find(s => s.id === line.sessionId)?.paidAt);
    const lines = original.lines.map(line => {
      const edit = draft.lines.find(l => l.sessionId === line.sessionId); const session = data.sessions.find(s => s.id === line.sessionId);
      if (!edit || !session || session.invoiceId && session.invoiceId !== original.id) throw new Error('invoiceSessionsMissing');
      if (!edit.description.trim() || edit.description.length > 1000 || !Number.isSafeInteger(edit.amountCents) || edit.amountCents < 0 || edit.amountCents % 100 || edit.amountCents > 99999900) throw new Error('invalidAmount');
      if (anyPaid && edit.amountCents !== line.amountCents) throw new Error('invoicePaidAmountLocked');
      let euroCents = line.euroCents;
      if (edit.amountCents !== line.amountCents) { euroCents = convertWhole(edit.amountCents, original.currency ?? 'EUR', 'EUR', line.rate); changedFees.set(line.sessionId, euroCents); }
      return { ...structuredClone(line), description: edit.description.trim(), amountCents: edit.amountCents, ...(original.currency === 'UAH' ? { euroCents: euroCents ?? session.feeCents } : {}) };
    });
    replacement = { id: draft.id, number: nextInvoiceNumber({ ...data, invoices: [...data.invoices, cancellation] }, revision.issuedAt, draft.sender.invoicePrefix), clientId: original.clientId, issuedAt: revision.issuedAt, dueOn: draft.dueOn,
      replaces: reference, correctionReason: revision.reason.trim(), language: draft.language, currency: original.currency, recipient: structuredClone(draft.recipient), sender: structuredClone(draft.sender), paymentAccount: structuredClone(draft.paymentAccount),
      lines, totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0), ...(original.currency === 'UAH' ? { totalEuroCents: lines.reduce((sum, line) => sum + (line.euroCents ?? 0), 0) } : {}) };
  }
  data.invoices.push(cancellation);
  if (replacement) {
    attachInvoice(data, replacement);
    for (const [id, feeCents] of changedFees) data.sessions.find(s => s.id === id)!.feeCents = feeCents;
  }
  reconcileBillingLinks(data);
  return { cancellation, replacement };
}

/** Recover links when a concurrent note edit contained the old invoice id. Never choose between two active replacements. */
export function reconcileBillingLinks(data: VaultData) {
  for (const session of data.sessions) {
    if (!isSessionVoided(data, session)) continue;
    const active = billingIndex(data).coverage.get(session.id) ?? [];
    if (active.length === 1) {
      const invoice = active[0]; const line = invoice.lines.find(l => l.sessionId === session.id)!; session.invoiceId = invoice.id;
      if (!session.paidAt) { session.feeCents = (invoice.currency ?? 'EUR') === 'EUR' ? line.amountCents : line.euroCents ?? session.feeCents; session.billing = { currency: invoice.currency ?? 'EUR', amountCents: line.amountCents, ...(line.rate && { rate: { ...line.rate } }) }; }
    }
  }
}
export function billingConflicts(data: VaultData): string[] {
  const index = billingIndex(data); const conflicts = new Set([...index.conflicts].flatMap(id => index.documents.get(id)?.number ?? []));
  for (const invoice of data.invoices) if (!isCancellation(invoice) && !cancellationOf(data, invoice.id) && invoice.lines.some(line => { const session = data.sessions.find(s => s.id === line.sessionId); const euro = (invoice.currency ?? 'EUR') === 'EUR' ? line.amountCents : line.euroCents; return !!session?.paidAt && euro !== undefined && session.feeCents !== euro; })) conflicts.add(invoice.number);
  for (const invoice of data.invoices) if (invoiceSyncConflict(data, invoice)) conflicts.add(invoice.number);
  return [...conflicts];
}
function invoiceSyncConflict(data: VaultData, invoice: Invoice): boolean {
  return syncConflicts(data).some(c => c.collection === 'invoices' && c.id === invoice.id || c.collection === 'sessions' && invoice.lines.some(l => l.sessionId === c.id) && ['$amount', 'paidAt', 'invoiceId', '$exists'].includes(c.field));
}

// ---- CSV for the tax advisor ----
const guard = (cell: string) => /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell; // spreadsheets would run these as formulas
const quote = (cell: string) => /[;"\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
const units = (cents: number) => String(Math.round(cents / 100));
/**
 * Income by payment date for one year. Client names are optional: a tax advisor normally needs only dates, amounts and
 * invoice numbers, so by default clients appear as "Klient 1, 2, …" (stable per export).
 */
export function incomeCsv(data: VaultData, year: number, withNames: boolean, language: Language): string {
  const head = (['csvPaidOn', 'csvSessionOn', 'csvClient', 'csvInvoice', 'csvAmount', 'csvOriginalAmount', 'csvCurrency', 'exchangeRate', 'exchangeRateDate', 'csvRateSource'] as const).map(key => translate(language, key));
  const invoiceOf = (s: Session) => data.invoices.find(i => i.id === s.invoiceId)?.number ?? '';
  const alias = new Map<string, string>();
  const rows = data.sessions.filter(s => s.paidAt?.startsWith(String(year))).sort((a, b) => a.paidAt!.localeCompare(b.paidAt!) || a.date.localeCompare(b.date)).map(s => {
    const name = data.clients.find(c => c.id === s.clientId)?.name ?? '';
    if (!alias.has(s.clientId)) alias.set(s.clientId, `${translate(language, 'csvClient')} ${alias.size + 1}`);
    return [s.paidAt!, s.date, withNames ? name : alias.get(s.clientId)!, invoiceOf(s), units(s.feeCents), units(s.billing?.amountCents ?? s.feeCents), s.billing?.currency ?? 'EUR', s.billing?.rate ? String(s.billing.rate.micros / 1_000_000).replace('.', ',') : '', s.billing?.rate?.date ?? '', s.billing?.rate?.source ?? ''];
  });
  return '﻿' + [head, ...rows].map(row => row.map(cell => quote(guard(cell))).join(';')).join('\r\n') + '\r\n';
}
export const formatTotal = (invoice: Invoice) => money(invoice.totalCents, invoice.language, invoice.currency ?? 'EUR');
