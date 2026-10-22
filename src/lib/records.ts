import type { Appointment, VaultData } from './types';
import { appointmentEnd, appointmentStart } from './dates';
import { referencedBlobs } from './blobs';

/** File ids no longer referenced by any record; callers delete them only after the vault write succeeded. */
export const orphanedBlobs = (before: string[], data: VaultData) => { const kept = new Set(referencedBlobs(data)); return before.filter(id => !kept.has(id)); };

export function deleteClient(data: VaultData, clientId: string) {
  data.clients = data.clients.filter(c => c.id !== clientId);
  data.appointments = data.appointments.filter(a => a.clientId !== clientId);
  data.sessions = data.sessions.filter(s => s.clientId !== clientId);
  data.notes = data.notes.filter(n => n.clientId !== clientId);
  data.invoices = data.invoices.filter(i => i.clientId !== clientId);
  data.assessments = data.assessments.filter(a => a.clientId !== clientId);
  data.documents = data.documents.filter(d => d.clientId !== clientId);
  data.audioMemos = (data.audioMemos ?? []).filter(m => m.clientId !== clientId);
}
export function deleteSession(data: VaultData, sessionId: string) {
  const session = data.sessions.find(s => s.id === sessionId);
  data.sessions = data.sessions.filter(s => s.id !== sessionId);
  data.notes = data.notes.filter(n => n.sessionId !== sessionId); // photos of the session go with it
  data.audioMemos = (data.audioMemos ?? []).filter(m => m.sessionId !== sessionId);
  // A completed appointment without its session would otherwise stay "completed" with nothing to show for it.
  const appointment = data.appointments.find(a => a.id === session?.appointmentId);
  if (appointment?.status === 'completed') appointment.status = 'scheduled';
}
export const deleteNote = (data: VaultData, noteId: string) => { data.notes = data.notes.filter(n => n.id !== noteId); };
export const deleteAudioMemo = (data: VaultData, id: string) => { data.audioMemos = (data.audioMemos ?? []).filter(m => m.id !== id); };

/** A scheduled appointment that overlaps the candidate in real time, even if the two were agreed in different zones. */
export function findConflict(appointments: Appointment[], candidate: Pick<Appointment, 'id' | 'date' | 'time' | 'duration' | 'timeZone'>): Appointment | undefined {
  const start = appointmentStart(candidate); const end = appointmentEnd(candidate);
  return appointments.find(a => a.id !== candidate.id && a.status === 'scheduled' && start < appointmentEnd(a) && appointmentStart(a) < end);
}
/** Suggest the fee last agreed with this client, so recurring sessions need no retyping. */
export function suggestedFee(data: VaultData, clientId: string, fallback = 8500): number {
  const latest = [...data.sessions.filter(s => s.clientId === clientId), ...data.appointments.filter(a => a.clientId === clientId)]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0];
  return latest?.feeCents ?? fallback;
}
export const feeText = (cents: number) => String(Math.round(cents / 100));
