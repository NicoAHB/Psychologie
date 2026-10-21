import { addDays, appointmentEnd, appointmentStart, isIsoDay, zonedInstant } from './dates';
import { isValidZone } from './zones';
import { localParts } from '../../shared/schedule-text.mjs';
import type { Appointment, CalendarAbsence, Language } from './types';

const validTime = (value?: string) => !!value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
/** Inclusive civil dates for all-day absences; timed ranges use an exclusive ending instant. */
export function absenceRange(absence: CalendarAbsence): { start: number; end: number } {
  if (!isIsoDay(absence.fromDate) || !isIsoDay(absence.untilDate) || absence.untilDate < absence.fromDate || !isValidZone(absence.timeZone) || !['vacation', 'unavailable'].includes(absence.kind) || absence.title.length > 500 || !absence.allDay && (!validTime(absence.startTime) || !validTime(absence.endTime))) throw new Error('availabilityInvalid');
  const start = Date.parse(zonedInstant(absence.fromDate, absence.allDay ? '00:00' : absence.startTime!, absence.timeZone));
  const end = Date.parse(zonedInstant(absence.allDay ? addDays(absence.untilDate, 1) : absence.untilDate, absence.allDay ? '00:00' : absence.endTime!, absence.timeZone));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('availabilityInvalid');
  return { start, end };
}
export function conflictsWithAbsence(appointment: Pick<Appointment, 'date' | 'time' | 'timeZone' | 'duration' | 'status'>, absence: CalendarAbsence): boolean {
  if (appointment.status === 'cancelled') return false;
  try { const range = absenceRange(absence); return appointmentStart(appointment) < range.end && appointmentEnd(appointment) > range.start; } catch { return false; }
}
export function dayAbsences(absences: CalendarAbsence[], day: string, zone: string, language: Language) {
  const dayStart = Date.parse(zonedInstant(day, '00:00', zone)); const dayEnd = Date.parse(zonedInstant(addDays(day, 1), '00:00', zone));
  const minutes = (at: number) => { const value = localParts(new Date(at).toISOString(), zone, language).time; return Number(value.slice(0, 2)) * 60 + Number(value.slice(3)); };
  return absences.flatMap(absence => {
    try {
      const { start, end } = absenceRange(absence); if (start >= dayEnd || end <= dayStart) return [];
      return [{ absence, start: start <= dayStart ? 0 : minutes(start), end: end >= dayEnd ? 1440 : minutes(end), fullDay: start <= dayStart && end >= dayEnd }];
    } catch { return []; }
  });
}
