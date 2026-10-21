import type { Session } from './types';

export type FinanceView = 'year' | 'monthIncome' | 'unpaid';
export type PaymentFilter = 'all' | 'paid' | 'unpaid';
/** Dashboard links must show the same records as the clicked figure, including payments for older sessions. */
export function financeRows(sessions: Session[], year: number, view: FinanceView, filter: PaymentFilter, now = new Date()): Session[] {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return sessions.filter(s => view === 'monthIncome' ? s.paidAt?.startsWith(month) : view === 'unpaid' ? !s.paidAt : s.date.startsWith(`${year}-`))
    .filter(s => filter === 'all' || (filter === 'paid' ? !!s.paidAt : !s.paidAt))
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
}
