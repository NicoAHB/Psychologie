import { appointmentEnd, byStart } from './dates';
import { pendingReturns, practiceToday } from './followUp';
import { workItems, type WorkItem } from './workItems';
import type { VaultData } from './types';

export function nextPracticeAppointment(data: VaultData, now = new Date()) {
  return data.appointments.filter(a => a.status === 'scheduled' && appointmentEnd(a) > now.getTime()).sort(byStart)[0];
}
export type DailyTask = { id: string; clientId: string; date: string; type: 'work'; item: WorkItem } | { id: string; clientId: string; date: string; type: 'return'; documentId: string; overdue: boolean };
/** Derived priorities only. The existing records remain the source of truth. */
export function dailyTasks(data: VaultData, now = new Date()): DailyTask[] {
  const day = practiceToday(data.settings, now);
  const tasks: DailyTask[] = workItems(data, now).filter(item => item.kind !== 'invoice').map(item => ({ id: `${item.kind}:${item.id}`, clientId: item.clientId, date: item.date, type: 'work', item }));
  for (const { document, status } of pendingReturns(data, day)) if (status !== 'waiting') tasks.push({ id: `return:${document.id}`, clientId: document.clientId, date: document.returnDueOn ?? document.createdAt.slice(0, 10), type: 'return', documentId: document.id, overdue: status === 'overdue' });
  const rank = (task: DailyTask) => task.type === 'return' ? task.overdue ? 0 : 3 : task.item.kind === 'followUp' && task.date < day ? 0 : task.item.kind === 'draft' ? 1 : 2;
  return tasks.sort((a,b) => rank(a) - rank(b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
