import { dateLabel, money } from './dates';
import { translate } from './i18n';
import type { Client, Invoice } from './types';

/** The client's language controls correspondence independently of the interface and invoice language. */
export function invoiceMessage(invoice: Invoice, client: Client, purpose: 'invoice' | 'paymentReminder' = 'invoice', outstandingCents = invoice.totalCents) {
  const language = client.language;
  const values: Record<string, string> = { number: invoice.number, original: invoice.cancels?.number ?? invoice.replaces?.number ?? '', name: client.name, date: dateLabel(invoice.issuedAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' }), amount: money(purpose === 'paymentReminder' ? outstandingCents : invoice.totalCents, language, invoice.currency ?? 'EUR'), practice: invoice.sender.name,
    dueDate: invoice.dueOn ? dateLabel(invoice.dueOn, language, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '' };
  values.due = invoice.dueOn ? translate(language, 'invoiceReminderDue').replace('{dueDate}', values.dueDate) : '';
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);
  const keys = purpose === 'paymentReminder' ? ['invoiceReminderSubject', 'invoiceReminderMessage'] as const : invoice.kind === 'cancellation' ? ['cancellationEmailSubject', 'cancellationMessage'] as const : invoice.replaces ? ['replacementEmailSubject', 'replacementMessage'] as const : ['invoiceEmailSubject', 'invoiceMessage'] as const;
  return { subject: fill(translate(language, keys[0])), body: fill(translate(language, keys[1])) };
}

export const invoiceFilename = (invoice: Invoice) => `${invoice.kind === 'cancellation' ? 'Storno' : 'Rechnung'}-${invoice.number.replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 100)}.pdf`;
