import type { Appointment, Client, Currency, Language, Session, Settings } from './types';
export const localeFor = (language: Language) => language === 'de' ? 'de-DE' : 'uk-UA';
const pad = (value: number) => String(value).padStart(2, '0');
export const isIsoDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const today = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
export function addDays(date: string, count: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}
export function addMonths(date: string, count: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year, month + count, 0)).getUTCDate(); // days in the target month
  return new Date(Date.UTC(year, month - 1 + count, Math.min(day, last))).toISOString().slice(0, 10);
}
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
// Wall-clock arithmetic without a Temporal polyfill: the browser's Intl data supplies the zone rules.
const formatters = new Map<string, Intl.DateTimeFormat>();
function zoneOffset(timeZone: string, instant: number): number {
  let format = formatters.get(timeZone);
  if (!format) { format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); formatters.set(timeZone, format); }
  const part = Object.fromEntries(format.formatToParts(instant).map(p => [p.type, Number(p.value)]));
  return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - instant; // instants are whole seconds
}
/** Instant of a local date and time. Ambiguous times resolve to the earlier occurrence, skipped times shift forward ("compatible"). */
export function zonedInstant(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(wall) || date !== new Date(wall).toISOString().slice(0, 10)) throw new Error('invalidDate');
  const before = zoneOffset(timeZone, wall - 864e5); const after = zoneOffset(timeZone, wall + 864e5);
  const valid = [...new Set([before, after])].map(offset => wall - offset).filter(instant => zoneOffset(timeZone, instant) === wall - instant).sort((a, b) => a - b);
  return new Date(valid[0] ?? wall - before).toISOString().replace('.000Z', 'Z');
}
/** The zone a client lives in; unset means "same as the practice". */
export const clientZone = (client: Pick<Client, 'timeZone'> | undefined, settings: Pick<Settings, 'timeZone'>) => client?.timeZone || settings.timeZone;
export const appointmentStart = (appointment: Pick<Appointment, 'date' | 'time' | 'timeZone'>) => Date.parse(appointmentInstant(appointment));
export const appointmentEnd = (appointment: Pick<Appointment, 'date' | 'time' | 'timeZone' | 'duration'>) => appointmentStart(appointment) + appointment.duration * 60000;
/** Chronological order across appointments agreed in different zones. */
export const byStart = (a: Appointment, b: Appointment) => appointmentStart(a) - appointmentStart(b);
export const dateLabel = (date: string, language: Language, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat(localeFor(language), options).format(new Date(`${date}T12:00:00`));
export const money = (cents: number, language: Language, currency: Currency = 'EUR') => new Intl.NumberFormat(localeFor(language), { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
export const appointmentInstant = (appointment: Pick<Appointment, 'date' | 'time' | 'timeZone'>) => zonedInstant(appointment.date, appointment.time, appointment.timeZone);
export const reminderInstant = (appointment: Pick<Appointment, 'date' | 'timeZone'>) => zonedInstant(addDays(appointment.date, -1), '18:00', appointment.timeZone);
export const reminderExpiration = (appointment: Pick<Appointment, 'date' | 'timeZone'>) => zonedInstant(appointment.date, '00:00', appointment.timeZone);
export function parseMoney(input: string): number {
  if (!/^\d{1,6}$/.test(input.trim())) throw new Error('invalidAmount');
  return Number(input.trim()) * 100;
}
export const tagsFrom = (input: string) => [...new Set(input.split(/[,#\n]+/).map(t => t.trim().replace(/^#+/, '')).filter(Boolean))].slice(0, 12);
export function monthlyIncome(sessions: Session[], year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return sessions.reduce((sum, session) => sum + (session.paidAt?.startsWith(month) ? session.feeCents : 0), 0);
  });
}
