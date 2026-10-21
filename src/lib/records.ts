import type { Appointment, VaultData } from './types';
import { referencedBlobs } from './blobs';

/** Image ids no longer referenced by any record; callers delete them only after the vault write succeeded. */
export const orphanedBlobs = (before: string[], data: VaultData) => before.filter(id => !referencedBlobs(data).includes(id));

export function deleteClient(data: VaultData, clientId: string) {
  data.clients = data.clients.filter(c => c.id !== clientId);
  data.appointments = data.appointments.filter(a => a.clientId !== clientId);
  data.sessions = data.sessions.filter(s => s.clientId !== clientId);
  data.notes = data.notes.filter(n => n.clientId !== clientId);
}
export function deleteSession(data: VaultData, sessionId: string) {
  const session = data.sessions.find(s => s.id === sessionId);
  data.sessions = data.sessions.filter(s => s.id !== sessionId);
  // A completed appointment without its session would otherwise stay "completed" with nothing to show for it.
  const appointment = data.appointments.find(a => a.id === session?.appointmentId);
  if (appointment?.status === 'completed') appointment.status = 'scheduled';
}
export const deleteNote = (data: VaultData, noteId: string) => { data.notes = data.notes.filter(n => n.id !== noteId); };

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** A scheduled appointment on the same day whose time range overlaps the candidate (ignoring `candidate.id` itself). */
export function findConflict(appointments: Appointment[], candidate: Pick<Appointment, 'id' | 'date' | 'time' | 'duration'>): Appointment | undefined {
  const start = minutes(candidate.time); const end = start + candidate.duration;
  return appointments.find(a => a.id !== candidate.id && a.status === 'scheduled' && a.date === candidate.date && start < minutes(a.time) + a.duration && minutes(a.time) < end);
}
/** Suggest the fee last agreed with this client, so recurring sessions need no retyping. */
export function suggestedFee(data: VaultData, clientId: string, fallback = 8500): number {
  const latest = [...data.sessions.filter(s => s.clientId === clientId), ...data.appointments.filter(a => a.clientId === clientId)]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0];
  return latest?.feeCents ?? fallback;
}
export const feeText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
