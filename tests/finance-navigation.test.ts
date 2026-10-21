import test from 'node:test';
import assert from 'node:assert/strict';
import { financeRows } from '../src/lib/finance';
import type { Session } from '../src/lib/types';

const row = (id: string, date: string, paidAt: string | null): Session => ({ id, clientId: 'c', date, time: '14:00', paidAt, feeCents: 8500, notes: '', tags: [] });
const sessions = [row('older-paid-now', '2025-12-15', '2026-10-05'), row('current-paid-now', '2026-10-02', '2026-10-03'), row('paid-last-month', '2026-09-12', '2026-09-14'), row('old-open', '2024-02-03', null), row('current-open', '2026-10-12', null)];
test('month-income navigation follows receipt date, including prior-year sessions', () => {
  assert.deepEqual(financeRows(sessions, 2026, 'monthIncome', 'paid', new Date(2026, 9, 21)).map(s => s.id), ['current-paid-now', 'older-paid-now']);
});
test('outstanding navigation includes every year; year view still respects its filter', () => {
  assert.deepEqual(financeRows(sessions, 2026, 'unpaid', 'unpaid').map(s => s.id), ['current-open', 'old-open']);
  assert.deepEqual(financeRows(sessions, 2026, 'year', 'unpaid').map(s => s.id), ['current-open']);
  assert.equal(sessions[0].id, 'older-paid-now');
});
