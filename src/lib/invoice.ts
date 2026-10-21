import { translate } from './i18n';
import { money } from './dates';
import type { Client, Invoice, Language, Session, VaultData } from './types';

/** Next gap-free number of the form `<prefix><year>-001`; counting continues per prefix and year. */
export function nextInvoiceNumber(data: VaultData, issuedAt: string, prefix = data.settings.practice.invoicePrefix): string {
  const year = issuedAt.slice(0, 4); const head = `${prefix}${year}-`;
  const used = data.invoices.map(i => i.number).filter(n => n.startsWith(head)).map(n => Number(n.slice(head.length))).filter(Number.isInteger);
  return `${head}${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}
/** Sessions of a client that no invoice covers yet. */
export const uninvoiced = (data: VaultData, clientId: string) => data.sessions.filter(s => s.clientId === clientId && !s.invoiceId).sort((a, b) => a.date.localeCompare(b.date));

export function buildInvoice(data: VaultData, client: Client, sessions: Session[], issuedAt: string, language: Language, id: string): Invoice {
  if (!sessions.length) throw new Error('noSessions');
  const service = data.settings.practice.serviceName.trim() || translate(language, 'invoiceDefaultService');
  const lines = sessions.map(s => ({ sessionId: s.id, date: s.date, description: service, amountCents: s.feeCents }));
  return { id, number: nextInvoiceNumber(data, issuedAt), clientId: client.id, issuedAt, lines, totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
    recipient: { name: client.name, address: client.address ?? '' }, sender: structuredClone(data.settings.practice), language };
}
/** Date of the last payment when every session of the invoice is paid, otherwise null. */
export function paidOn(data: VaultData, invoice: Invoice): string | null {
  const paid = invoice.lines.map(line => data.sessions.find(s => s.id === line.sessionId)?.paidAt ?? null);
  return paid.length && paid.every(Boolean) ? paid.sort().at(-1)! : null;
}

// ---- CSV for the tax advisor ----
const guard = (cell: string) => /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell; // spreadsheets would run these as formulas
const quote = (cell: string) => /[;"\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
/**
 * Income by payment date for one year. Client names are optional: a tax advisor normally needs only dates, amounts and
 * invoice numbers, so by default clients appear as "Klient 1, 2, …" (stable per export).
 */
export function incomeCsv(data: VaultData, year: number, withNames: boolean, language: Language): string {
  const head = (['csvPaidOn', 'csvSessionOn', 'csvClient', 'csvInvoice', 'csvAmount'] as const).map(key => translate(language, key));
  const invoiceOf = (s: Session) => data.invoices.find(i => i.id === s.invoiceId)?.number ?? '';
  const alias = new Map<string, string>();
  const rows = data.sessions.filter(s => s.paidAt?.startsWith(String(year))).sort((a, b) => a.paidAt!.localeCompare(b.paidAt!) || a.date.localeCompare(b.date)).map(s => {
    const name = data.clients.find(c => c.id === s.clientId)?.name ?? '';
    if (!alias.has(s.clientId)) alias.set(s.clientId, `${translate(language, 'csvClient')} ${alias.size + 1}`);
    return [s.paidAt!, s.date, withNames ? name : alias.get(s.clientId)!, invoiceOf(s), euros(s.feeCents)];
  });
  return '﻿' + [head, ...rows].map(row => row.map(cell => quote(guard(cell))).join(';')).join('\r\n') + '\r\n';
}
export const formatTotal = (invoice: Invoice) => money(invoice.totalCents, invoice.language);
