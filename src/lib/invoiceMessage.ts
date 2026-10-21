import { dateLabel, money } from './dates';
import { translate } from './i18n';
import type { Client, Invoice } from './types';

/** The client's language controls correspondence independently of the interface and invoice language. */
export function invoiceMessage(invoice: Invoice, client: Client) {
  const language = client.language;
  const values: Record<string, string> = { number: invoice.number, name: client.name, date: dateLabel(invoice.issuedAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' }), amount: money(invoice.totalCents, language, invoice.currency ?? 'EUR'), practice: invoice.sender.name };
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);
  return { subject: fill(translate(language, 'invoiceEmailSubject')), body: fill(translate(language, 'invoiceMessage')) };
}

export const invoiceFilename = (invoice: Invoice) => `Rechnung-${invoice.number.replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 100)}.pdf`;
