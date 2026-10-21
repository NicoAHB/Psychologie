import { alsoLine, confirmationMessage, fullWhen, localParts, placeTime, zoneCity } from '../../shared/schedule-text.mjs';
import { appointmentInstant, clientZone } from './dates';
import type { Appointment, Client, Language, Settings } from './types';
export { COMMON_ZONES, isValidZone, placeTime, utcOffset, zoneCity } from '../../shared/schedule-text.mjs';

/** How an appointment reads for the practitioner (practice zone) and, if elsewhere, for the client. */
export function appointmentView(a: Appointment, client: Client | undefined, settings: Settings, language: Language) {
  const instant = appointmentInstant(a);
  const practice = localParts(instant, settings.timeZone, language);
  const zone = clientZone(client, settings);
  const differs = zone !== settings.timeZone && localParts(instant, zone, language).time !== practice.time;
  return { instant, practice, practiceZone: settings.timeZone, clientZone: zone, differs, clientText: differs ? placeTime(instant, zone, language) : '' };
}
/** Plain text for a message to the client: their local time first, the practice's time for orientation. */
export function confirmationFor(a: Appointment, client: Client, settings: Settings) {
  return confirmationMessage({ startsAt: appointmentInstant(a), clientTimeZone: clientZone(client, settings), advisorTimeZone: settings.timeZone, language: client.language }, settings.practice.name);
}
export { alsoLine, fullWhen, localParts };
