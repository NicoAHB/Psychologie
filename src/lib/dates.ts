import { Temporal } from '@js-temporal/polyfill';
import type { Appointment, Language, Session } from './types';
export const localeFor = (language: Language) => language === 'de' ? 'de-DE' : 'uk-UA';
export const today = () => Temporal.Now.plainDateISO().toString();
export const addDays = (date: string, count: number) => Temporal.PlainDate.from(date).add({ days: count }).toString();
export const dateLabel = (date: string, language: Language, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat(localeFor(language), options).format(new Date(`${date}T12:00:00`));
export const money = (cents: number, language: Language) => new Intl.NumberFormat(localeFor(language), { style: 'currency', currency: 'EUR' }).format(cents / 100);
export function appointmentInstant(appointment: Pick<Appointment, 'date' | 'time' | 'timeZone'>): string {
  return Temporal.PlainDate.from(appointment.date).toZonedDateTime({ timeZone: appointment.timeZone, plainTime: appointment.time }).toInstant().toString();
}
export function reminderInstant(appointment: Pick<Appointment, 'date' | 'timeZone'>): string {
  return Temporal.PlainDate.from(appointment.date).subtract({ days: 1 }).toZonedDateTime({ timeZone: appointment.timeZone, plainTime: '18:00' }).toInstant().toString();
}
export function parseMoney(input: string): number {
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(input.trim())) throw new Error('invalidAmount');
  const [whole, fraction = ''] = input.trim().replace(',', '.').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export const tagsFrom = (input: string) => [...new Set(input.split(/[,#\n]+/).map(t => t.trim().replace(/^#+/, '')).filter(Boolean))].slice(0, 12);
export function monthlyIncome(sessions: Session[], year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return sessions.reduce((sum, session) => sum + (session.paidAt?.startsWith(month) ? session.feeCents : 0), 0);
  });
}
