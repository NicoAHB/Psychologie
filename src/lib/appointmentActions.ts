import type { VaultData } from './types';
import { releaseSlot } from './waitlist';

/** Recheck the current records inside the encrypted write queue. A completed or
 * otherwise changed appointment must not be cancelled by an older open menu. */
export function cancelScheduledAppointments(data: VaultData, ids: ReadonlySet<string>, now = new Date().toISOString()) {
  const eligible = data.appointments.filter(a => ids.has(a.id) && a.status === 'scheduled');
  if (!eligible.length) throw new Error('appointmentCancelUnavailable');
  for (const appointment of eligible) {
    releaseSlot(appointment, now);
    appointment.status = 'cancelled';
  }
  return eligible.length;
}
