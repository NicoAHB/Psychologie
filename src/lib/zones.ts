import { alsoLine, confirmationMessage, dayShift, fullWhen, localParts, placeTime, utcOffset, zoneCity, zoneCountryCode, zonePlace } from '../../shared/schedule-text.mjs';
import { appointmentInstant, clientZone } from './dates';
import type { Appointment, Client, Language, Settings } from './types';
export { COMMON_ZONES, isValidZone, placeTime, utcOffset, zoneCity, zonePlace } from '../../shared/schedule-text.mjs';

/** Short tag for a zone in compact displays: the country code ("DE", "UA") or the first letters of the city. */
export const zoneTag = (zone: string, language: Language) => zoneCountryCode(zone) || zoneCity(zone, language).slice(0, 3).toUpperCase();
export interface TimeAt { zone: string; iso: string; time: string; date: string; offset: string; place: string; tag: string; shift: number }
export const timeAt = (instant: string, zone: string, reference: string, language: Language): TimeAt => ({
  zone, ...localParts(instant, zone, language), offset: utcOffset(zone, instant), place: zonePlace(zone, language), tag: zoneTag(zone, language), shift: dayShift(instant, zone, reference),
});
/**
 * How an appointment reads for the practitioner (practice zone) and for the client. `differs` is true when the client's
 * clock shows another time (or day) than the practice's; then both are always displayed together.
 */
export function appointmentView(a: Appointment, client: Client | undefined, settings: Settings, language: Language) {
  const instant = appointmentInstant(a);
  const practice = timeAt(instant, settings.timeZone, settings.timeZone, language);
  const theirs = timeAt(instant, clientZone(client, settings), settings.timeZone, language);
  const differs = theirs.zone !== practice.zone && (theirs.time !== practice.time || theirs.iso !== practice.iso);
  return { instant, practice, practiceZone: practice.zone, clientZone: theirs.zone, client: theirs, differs, clientText: differs ? placeTime(instant, theirs.zone, language) : '' };
}
/** Plain text for a message to the client: their local time first, the practice's time for orientation. */
export function confirmationFor(a: Appointment, client: Client, settings: Settings) {
  return confirmationMessage({ startsAt: appointmentInstant(a), clientTimeZone: clientZone(client, settings), advisorTimeZone: settings.timeZone, language: client.language }, settings.practice.name);
}
export { alsoLine, fullWhen, localParts };
