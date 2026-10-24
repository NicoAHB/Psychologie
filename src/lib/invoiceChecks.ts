import { bankFor } from './currency';
import type { BankAccount, Currency, Invoice, PracticeProfile } from './types';

export type InvoiceIssue = 'recipientName' | 'recipientAddress' | 'practiceName' | 'practiceAddress' | 'bank';
export interface InvoiceCheckSource { recipient: { name: string; address: string }; sender: PracticeProfile; currency?: Currency; paymentAccount?: BankAccount; kind?: Invoice['kind'] }
export function invoiceChecks(source: InvoiceCheckSource): { issues: InvoiceIssue[]; account: BankAccount; currency: Currency } {
  const issues: InvoiceIssue[] = [], currency = source.currency ?? 'EUR';
  // Issued invoices use their immutable account snapshot, including an empty one.
  const account = source.paymentAccount ?? bankFor(source.sender, currency);
  if (!source.recipient.name.trim()) issues.push('recipientName');
  if (!source.recipient.address.trim()) issues.push('recipientAddress');
  if (!source.sender.name.trim()) issues.push('practiceName');
  if (!source.sender.address.trim()) issues.push('practiceAddress');
  if (source.kind !== 'cancellation' && !account.iban.trim()) issues.push('bank');
  return { issues, account, currency };
}
