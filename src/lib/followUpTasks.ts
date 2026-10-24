import { addDays, isIsoDay } from './dates';
import type { FollowUpTask, VaultData } from './types';

export type FollowUpFilter = 'all' | 'overdue' | 'today' | 'week' | 'later';
export interface FollowUpRow extends FollowUpTask { legacy?: boolean }
const legacyId = (clientId: string) => `legacy-follow-up:${clientId}`;
/** Old single reminders stay in their existing causal client fields. Reading
 * them as virtual rows avoids rewriting old backups or resurrecting a date. */
export function followUpRows(data: VaultData): FollowUpRow[] {
  const owners = new Set(data.clients.map(c => c.id));
  return [
    ...(data.followUps ?? []).filter(task => owners.has(task.clientId) && !task.completedAt && !Object.hasOwn(data.deleted, task.id)),
    ...data.clients.filter(c => c.followUpOn && isIsoDay(c.followUpOn)).map(c => ({
      id: legacyId(c.id), clientId: c.id, dueOn: c.followUpOn!, note: c.followUpNote ?? '', createdAt: c.createdAt, legacy: true,
    })),
  ].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
}
export function matchesFollowUp(task: Pick<FollowUpTask, 'dueOn'>, filter: FollowUpFilter, day: string): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const monday = addDays(day, -((weekday + 6) % 7)), sunday = addDays(monday, 6);
  return filter === 'all' || (filter === 'overdue' ? task.dueOn < day : filter === 'today' ? task.dueOn === day
    : filter === 'week' ? task.dueOn >= monday && task.dueOn <= sunday : task.dueOn > sunday);
}
export function saveFollowUp(data: VaultData, task: FollowUpRow) {
  if (!data.clients.some(c => c.id === task.clientId) || !isIsoDay(task.dueOn) || !task.note.trim() || task.note.trim().length > 500) throw new Error('followUpTaskRequired');
  if (task.legacy) {
    const owner = data.clients.find(c => c.id === task.clientId)!;
    if (task.id !== legacyId(owner.id) || !owner.followUpOn) throw new Error('storageError');
    owner.followUpOn = task.dueOn; owner.followUpNote = task.note.trim(); return;
  }
  if (task.id.startsWith('legacy-follow-up:') || Object.hasOwn(data.deleted, task.id)) throw new Error('storageError');
  const index = (data.followUps ??= []).findIndex(t => t.id === task.id);
  if (index < 0) data.followUps.push({ id: task.id, clientId: task.clientId, dueOn: task.dueOn, note: task.note.trim(), createdAt: task.createdAt });
  else {
    const current = data.followUps[index];
    if (current.clientId !== task.clientId || current.completedAt) throw new Error('storageError');
    current.dueOn = task.dueOn; current.note = task.note.trim();
  }
}
export function finishFollowUp(data: VaultData, task: FollowUpRow, at = new Date().toISOString()) {
  if (task.legacy) {
    const owner = data.clients.find(c => c.id === task.clientId);
    if (owner?.followUpOn === task.dueOn && (owner.followUpNote ?? '') === task.note) delete owner.followUpOn;
    else throw new Error('storageError');
  } else {
    const row = (data.followUps ?? []).find(t => t.id === task.id && t.clientId === task.clientId);
    if (row) row.completedAt ??= at;
  }
}
export function deleteFollowUp(data: VaultData, task: FollowUpRow) {
  if (task.legacy) finishFollowUp(data, task);
  else data.followUps = (data.followUps ?? []).filter(t => t.id !== task.id || t.clientId !== task.clientId);
}
