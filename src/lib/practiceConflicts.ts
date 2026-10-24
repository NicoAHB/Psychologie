import { resolveConflict, syncConflicts, type SyncConflict, type Version } from './crdt';
import { reconcileAppointmentOutcomes } from './cancellations';
import type { VaultData } from './types';
/** A payment variant also identifies whether its appointment happened or was missed.
 * Never let an independent status choice contradict an existing charge. */
export function resolvePracticeConflict(data: VaultData, conflict: SyncConflict, chosen: Version, text?: string) {
  if (conflict.collection === 'appointments' && conflict.field === 'status') {
    const linked = data.sessions.filter(s => s.appointmentId === conflict.id);
    if (linked.some(s => (s.kind === 'cancellationFee' ? s.failureStatus ?? 'noShow' : 'completed') !== (text ?? chosen.value))) throw new Error('syncConflictOutcomeMismatch');
  }
  resolveConflict(data,conflict,chosen,text);
  if (conflict.collection !== 'sessions' || conflict.field !== '$amount') return;
  reconcileAppointmentOutcomes(data);
  const session=data.sessions.find(s=>s.id===conflict.id);
  if (!session?.appointmentId) return;
  const status=session.kind === 'cancellationFee' ? session.failureStatus ?? 'noShow' : 'completed';
  const paired=syncConflicts(data).find(c=>c.collection==='appointments' && c.id===session.appointmentId && c.field==='status');
  const matching=paired?.variants.find(v=>v.value===status);
  if(paired && matching)resolveConflict(data,paired,matching);
}
