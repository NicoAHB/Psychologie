import { alsoLine, fullWhen } from '../../shared/schedule-text.mjs';
import { appointmentEnd, appointmentInstant, byStart, clientZone, daysBetween, today } from './dates';
import { translate } from './i18n';
import type { Appointment, Client, Session, Settings, VaultData } from './types';

export interface ClientOverview {
  sessions: Session[]; recent: Session[]; lastSession?: Session; nextAppointment?: Appointment;
  openHomework: Session[]; threads: [string, number][]; unpaidCents: number;
}
const bySessionDesc = (a: Session, b: Session) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`);
/** Everything the profile's "at a glance" page shows about one client. */
export function overviewOf(data: VaultData, clientId: string, now = Date.now()): ClientOverview {
  const sessions = data.sessions.filter(s => s.clientId === clientId).sort(bySessionDesc);
  const counts = new Map<string, number>();
  // Photos attached to a session carry that session's tags; counting them again would inflate a theme.
  const own = new Set(sessions.map(s => s.id));
  for (const tag of [...sessions.flatMap(s => s.tags), ...data.notes.filter(n => n.clientId === clientId && !(n.sessionId && own.has(n.sessionId))).flatMap(n => n.tags)]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return {
    sessions, recent: sessions.slice(0, 3), lastSession: sessions[0],
    nextAppointment: data.appointments.filter(a => a.clientId === clientId && a.status === 'scheduled' && appointmentEnd(a) >= now).sort(byStart)[0],
    openHomework: sessions.filter(s => s.homework?.trim() && !s.homeworkDone),
    threads: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8),
    unpaidCents: sessions.filter(s => !s.paidAt).reduce((sum, s) => sum + s.feeCents, 0),
  };
}
/** The newest homework that has not been reviewed yet, so the next session can start by asking about it. */
export const pendingHomework = (data: VaultData, clientId: string, exceptSessionId?: string) =>
  data.sessions.filter(s => s.clientId === clientId && s.id !== exceptSessionId && s.homework?.trim() && !s.homeworkDone).sort(bySessionDesc)[0];
/** "Today", "yesterday" or the number of days since an ISO date. */
export const daysSince = (date: string, reference = today()) => Math.max(0, daysBetween(date, reference));
/** First sentence-ish excerpt of a note for lists; never cuts in the middle of a word when avoidable. */
export function excerpt(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max); const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max)} …`;
}
/**
 * Message to paste into a messenger: the homework in the client's language, plus the next appointment in the client's
 * local time (with the practice time for orientation when the zones differ).
 */
export function homeworkMessage(client: Client, session: Session, next: Appointment | undefined, settings: Pick<Settings, 'timeZone'>): string {
  const language = client.language; const lead = `${translate(language, 'homeworkMessageLead')}:\n${session.homework?.trim() ?? ''}`;
  if (!next) return lead;
  const instant = appointmentInstant(next); const zone = clientZone(client, settings);
  const orientation = alsoLine(instant, zone, settings.timeZone, language);
  return `${lead}\n\n${translate(language, 'nextAppointmentLabel')}: ${fullWhen(instant, zone, language)}.${orientation ? ` ${orientation}` : ''}`;
}
