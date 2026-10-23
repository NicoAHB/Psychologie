import { appointmentStart } from './dates';
import { conflictsWithAbsence } from './availability';
import { findConflict } from './records';
import type { Appointment, ReleasedSlot, VaultData, WaitlistEntry } from './types';
/** Minimal historic slot, no name or clinical content. All data remains in the encrypted vault. */
export function releaseSlot(appointment: Appointment, now = new Date().toISOString()) {
  if (appointmentStart(appointment) <= Date.parse(now)) return;
  const { date,time,duration,timeZone } = appointment;
  const id = JSON.stringify([appointment.id,date,time,duration,timeZone]);
  if (appointment.releasedSlots?.some(s => s.id === id)) return;
  (appointment.releasedSlots ??= []).push({ id,date,time,duration,timeZone,releasedAt:now });
}
export function freedSlots(data: VaultData, now = Date.now()): ReleasedSlot[] {
  const slots = data.appointments.flatMap(a => [...(a.releasedSlots ?? []), ...(['cancelled','lateCancelled'].includes(a.status) ? [{ id:a.id,date:a.date,time:a.time,duration:a.duration,timeZone:a.timeZone,releasedAt:'' }] : [])]);
  const seen = new Set<string>();
  return slots.filter(s => {
    const identity = `${appointmentStart(s)}:${s.duration}`; if (seen.has(identity) || appointmentStart(s) <= now) return false; seen.add(identity);
    const candidate = { ...s,id:'released-slot',status:'scheduled' as const };
    return !findConflict(data.appointments,candidate) && !data.availability.some(a => conflictsWithAbsence(candidate,a));
  }).sort((a,b)=>appointmentStart(a)-appointmentStart(b));
}
export function saveWaitingEntry(data: VaultData, entry: WaitlistEntry) {
  if (!entry.name.trim() || entry.name.length > 100 || entry.preferredTimes.length > 500 || entry.note.length > 2000 || entry.clientId && !data.clients.some(c=>c.id===entry.clientId)) throw new Error('required');
  const result = { ...entry,name:entry.name.trim(),preferredTimes:entry.preferredTimes.trim(),note:entry.note.trim() };
  const index = data.waitlist.findIndex(w=>w.id===entry.id); if (index < 0) data.waitlist.push(result); else data.waitlist[index]=result;
}
