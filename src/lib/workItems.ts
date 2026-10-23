import { appointmentEnd } from './dates';
import { practiceToday } from './followUp';
import { isSessionVoided } from './invoice';
import type { Session, VaultData } from './types';
export type WorkItem = { id: string; kind: 'draft' | 'session' | 'appointment' | 'invoice' | 'followUp'; clientId: string; date: string };
/** Derived tasks disappear when the actual work is completed; no second mutable checklist. */
export function workItems(data: VaultData, now = new Date()): WorkItem[] {
  const day = practiceToday(data.settings, now), clients = new Set(data.clients.map(c => c.id));
  const entries: WorkItem[] = (data.sessionDrafts ?? []).filter(d => clients.has(d.clientId)).map(d => ({ id: d.id, kind: 'draft', clientId: d.clientId, date: d.payload.date }));
  const draftedSessions = new Set((data.sessionDrafts ?? []).map(d => d.originalSessionId));
  const draftedAppointments = new Set((data.sessionDrafts ?? []).map(d => d.appointmentId));
  const documented = new Set(data.sessions.map(s => s.appointmentId));
  const attachments = new Set([...data.notes, ...data.audioMemos].map(n => n.sessionId));
  for (const appointment of data.appointments) if (appointment.status === 'scheduled' && appointmentEnd(appointment) < now.getTime() && !documented.has(appointment.id) && !draftedAppointments.has(appointment.id)) entries.push({ id: appointment.id, kind: 'appointment', clientId: appointment.clientId, date: appointment.date });
  const unbilled = new Map<string, Session>();
  for (const session of data.sessions) {
    if (session.date > day) continue;
    if (!session.notes.trim() && !attachments.has(session.id) && !draftedSessions.has(session.id)) entries.push({ id: session.id, kind: 'session', clientId: session.clientId, date: session.date });
    if (!session.invoiceId && !isSessionVoided(data, session) && (!unbilled.has(session.clientId) || session.date < unbilled.get(session.clientId)!.date)) unbilled.set(session.clientId, session);
  }
  for (const client of data.clients) {
    if (client.followUpOn && client.followUpOn <= day) entries.push({ id: client.id, kind: 'followUp', clientId: client.id, date: client.followUpOn });
    const first = unbilled.get(client.id);
    if (first) entries.push({ id: client.id, kind: 'invoice', clientId: client.id, date: first.date });
  }
  const priority = { draft: 0, followUp: 1, appointment: 2, session: 2, invoice: 3 };
  return entries.filter(e => clients.has(e.clientId)).sort((a, b) => priority[a.kind] - priority[b.kind] || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
