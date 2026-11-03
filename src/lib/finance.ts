import type { Session } from './types';

export type FinanceView = 'year' | 'monthIncome' | 'lastMonthIncome' | 'unpaid' | 'overdue';
export type PaymentFilter = 'all' | 'paid' | 'unpaid';
/** Dashboard links must show the same records as the clicked figure, including payments for older sessions. */
export function financeRows(sessions: Session[], year: number, view: FinanceView, filter: PaymentFilter, now = new Date()): Session[] {
  const date = new Date(now.getFullYear(), now.getMonth() - (view === 'lastMonthIncome' ? 1 : 0), 1);
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return sessions.filter(s => ['monthIncome','lastMonthIncome'].includes(view) ? s.paidAt?.startsWith(month) : ['unpaid','overdue'].includes(view) ? !s.paidAt : s.date.startsWith(`${year}-`))
    .filter(s => filter === 'all' || (filter === 'paid' ? !!s.paidAt : !s.paidAt))
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
}
