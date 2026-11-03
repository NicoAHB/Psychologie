import { overdueInvoices } from './followUp';
import { isSessionVoided } from './invoice';
import type { Currency, Session, VaultData } from './types';
export const nativeAmount = (session: Session) => session.billing?.amountCents ?? session.feeCents;
export const nativeCurrency = (session: Session): Currency => session.billing?.currency ?? 'EUR';
export function currencyTotals(sessions: readonly Session[]): Record<Currency, number> {
  const result = { EUR: 0, UAH: 0 };
  for (const session of sessions) result[nativeCurrency(session)] += nativeAmount(session);
  return result;
}
export function paymentMonth(now = new Date(), offset = 0) { const date = new Date(now.getFullYear(), now.getMonth() + offset, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
export function receiptTotals(sessions: readonly Session[], prefix: string) { return currencyTotals(sessions.filter(s => s.paidAt?.startsWith(prefix))); }
/** Only unpaid lines on genuinely overdue invoices; open unbilled work is not overdue. */
export function overduePaymentIds(data: VaultData, reference?: string) {
  return new Set(overdueInvoices(data, reference).flatMap(invoice => invoice.lines.map(line => line.sessionId)));
}
export function openPayments(data: VaultData, overdue = false) {
  const ids = overdue ? overduePaymentIds(data) : undefined;
  return data.sessions.filter(s => !s.paidAt && !isSessionVoided(data,s) && (!ids || ids.has(s.id))).sort((a,b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}
export function nativeMonthlyIncome(sessions: readonly Session[], year: number, currency: Currency | 'comparison' = 'comparison'): number[] {
  const values = Array<number>(12).fill(0);
  for (const session of sessions) if (session.paidAt?.startsWith(`${year}-`) && (currency === 'comparison' || nativeCurrency(session) === currency)) values[Number(session.paidAt.slice(5,7)) - 1] += currency === 'comparison' ? session.feeCents : nativeAmount(session);
  return values;
}
