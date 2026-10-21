import { invoiceOverdue } from './invoice';
import type { ClientDocument, Settings, VaultData } from './types';

export function practiceToday(settings: Pick<Settings, 'timeZone'>, now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: settings.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const hasDocumentReceipt = (document: ClientDocument) => document.deliveries.some(d => !!d.acceptedAt) || !!document.telegramDeliveries?.some(d => !!d.acceptedAt);
export function pendingReturns(data: VaultData, reference = practiceToday(data.settings)) {
  return data.documents.filter(d => d.returnExpected && !d.returnClosedAt && !d.returns.length && data.clients.some(c => c.id === d.clientId))
    .map(document => ({ document, status: !hasDocumentReceipt(document) ? 'notSent' as const : document.returnDueOn && document.returnDueOn < reference ? 'overdue' as const : 'waiting' as const }))
    .sort((a, b) => ({ overdue: 0, waiting: 1, notSent: 2 }[a.status] - { overdue: 0, waiting: 1, notSent: 2 }[b.status]) || (a.document.returnDueOn ?? '9999').localeCompare(b.document.returnDueOn ?? '9999') || a.document.createdAt.localeCompare(b.document.createdAt));
}
export const overdueInvoices = (data: VaultData, reference = practiceToday(data.settings)) => data.invoices.filter(i => invoiceOverdue(data, i, reference)).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));
