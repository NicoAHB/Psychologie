// Wording and time-zone display shared by the app and the reminder worker, so both always show the same thing.
// Every time is written together with its place and UTC offset; "tomorrow" and bare clock times are never used.

const CITIES = {
  'Europe/Berlin': ['Berlin', 'Берлін'], 'Europe/Kyiv': ['Kiew', 'Київ'], 'Europe/Kiev': ['Kiew', 'Київ'], 'Europe/Vienna': ['Wien', 'Відень'],
  'Europe/Zurich': ['Zürich', 'Цюрих'], 'Europe/Warsaw': ['Warschau', 'Варшава'], 'Europe/Prague': ['Prag', 'Прага'], 'Europe/Budapest': ['Budapest', 'Будапешт'],
  'Europe/Bucharest': ['Bukarest', 'Бухарест'], 'Europe/Chisinau': ['Chișinău', 'Кишинів'], 'Europe/London': ['London', 'Лондон'], 'Europe/Dublin': ['Dublin', 'Дублін'],
  'Europe/Lisbon': ['Lissabon', 'Лісабон'], 'Europe/Madrid': ['Madrid', 'Мадрид'], 'Europe/Paris': ['Paris', 'Париж'], 'Europe/Rome': ['Rom', 'Рим'],
  'Europe/Amsterdam': ['Amsterdam', 'Амстердам'], 'Europe/Brussels': ['Brüssel', 'Брюссель'], 'Europe/Copenhagen': ['Kopenhagen', 'Копенгаген'],
  'Europe/Stockholm': ['Stockholm', 'Стокгольм'], 'Europe/Oslo': ['Oslo', 'Осло'], 'Europe/Helsinki': ['Helsinki', 'Гельсінкі'], 'Europe/Vilnius': ['Vilnius', 'Вільнюс'],
  'Europe/Riga': ['Riga', 'Рига'], 'Europe/Tallinn': ['Tallinn', 'Таллінн'], 'Europe/Athens': ['Athen', 'Афіни'], 'Europe/Istanbul': ['Istanbul', 'Стамбул'],
  'Europe/Sofia': ['Sofia', 'Софія'], 'Europe/Belgrade': ['Belgrad', 'Белград'], 'Europe/Zagreb': ['Zagreb', 'Загреб'], 'Europe/Bratislava': ['Bratislava', 'Братислава'],
  'Europe/Luxembourg': ['Luxemburg', 'Люксембург'], 'Europe/Minsk': ['Minsk', 'Мінськ'], 'America/New_York': ['New York', 'Нью-Йорк'], 'America/Toronto': ['Toronto', 'Торонто'],
  'America/Chicago': ['Chicago', 'Чикаго'], 'America/Los_Angeles': ['Los Angeles', 'Лос-Анджелес'], 'Asia/Dubai': ['Dubai', 'Дубай'], 'Asia/Jerusalem': ['Jerusalem', 'Єрусалим'],
  'UTC': ['UTC', 'UTC'],
};
export const COMMON_ZONES = Object.keys(CITIES).filter(zone => zone !== 'Europe/Kiev' && zone !== 'UTC');

/** Place name of a zone in the given language ("Europe/Kyiv" -> "Kiew" / "Київ"); unknown zones fall back to the IANA city. */
export function zoneCity(zone, language) {
  const known = CITIES[zone];
  return known ? known[language === 'uk' ? 1 : 0] : zone.split('/').pop().replaceAll('_', ' ');
}
export const isValidZone = zone => { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return typeof zone === 'string' && zone.length > 0; } catch { return false; } };
/** "UTC+3", "UTC+5:30", "UTC" for the offset the zone has at that instant (summer/winter time included). */
export function utcOffset(zone, instant) {
  const part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date(instant)).find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  return part === 'GMT' ? 'UTC' : part.replace('GMT', 'UTC').replace('−', '-');
}
const locale = language => language === 'uk' ? 'uk-UA' : 'de-DE';
/** Calendar day and clock time of an instant in a zone. */
export function localParts(instant, zone, language) {
  const when = new Date(instant);
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when);
  return {
    iso, time: new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(when),
    // Weekday and date are formatted separately: some ICU versions inflect the weekday (accusative) when they are combined.
    date: `${new Intl.DateTimeFormat(locale(language), { timeZone: zone, weekday: 'long' }).format(when)}, ${new Intl.DateTimeFormat(locale(language), { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' }).format(when)}`,
  };
}
const clock = (parts, language) => language === 'uk' ? parts.time : `${parts.time} Uhr`;
/** "19:00 Uhr (Kiew, UTC+3)" */
export function placeTime(instant, zone, language) {
  return `${clock(localParts(instant, zone, language), language)} (${zoneCity(zone, language)}, ${utcOffset(zone, instant)})`;
}
/** "Mittwoch, 15. Juli 2026, 19:00 Uhr (Kiew, UTC+3)" */
export function fullWhen(instant, zone, language) {
  return `${localParts(instant, zone, language).date}, ${placeTime(instant, zone, language)}`;
}
/** The same moment for someone elsewhere, when the zones differ; empty otherwise. */
export function alsoLine(instant, zone, otherZone, language) {
  if (!otherZone || otherZone === zone) return '';
  const own = localParts(instant, zone, language); const other = localParts(instant, otherZone, language);
  if (own.iso === other.iso && own.time === other.time) return ''; // same wall clock, nothing to explain
  const day = own.iso === other.iso ? '' : `, ${other.date}`;
  return `${language === 'uk' ? 'Для довідки' : 'Zur Orientierung'} — ${zoneCity(otherZone, language)}: ${clock(other, language)} (${utcOffset(otherZone, instant)})${day}.`;
}
/**
 * Telegram text. `job` = { startsAt (ISO instant), clientTimeZone, advisorTimeZone, language }.
 * The client reads their own local time first and, if different, the practice's time for orientation.
 */
export function reminderMessage(recipient, job) {
  const language = recipient === 'advisor' ? 'de' : job.language;
  const zone = recipient === 'advisor' ? job.advisorTimeZone : job.clientTimeZone;
  const other = recipient === 'advisor' ? job.clientTimeZone : job.advisorTimeZone;
  const lead = recipient === 'advisor' ? 'Erinnerung an einen Termin' : language === 'uk' ? 'Нагадування про Вашу зустріч' : 'Erinnerung an Ihren Termin';
  const orientation = alsoLine(job.startsAt, zone, other, language);
  const note = recipient === 'advisor' && orientation ? orientation.replace('Zur Orientierung', 'Klient') : orientation;
  return `${lead}: ${fullWhen(job.startsAt, zone, language)}.${note ? ` ${note}` : ''}`;
}
/** Text a practitioner can paste into any messenger to confirm an appointment. */
export function confirmationMessage(job, practiceName = '') {
  const language = job.language;
  const lead = language === 'uk' ? 'Підтверджую нашу зустріч' : 'Ich bestätige unseren Termin';
  const orientation = alsoLine(job.startsAt, job.clientTimeZone, job.advisorTimeZone, language);
  return `${lead}: ${fullWhen(job.startsAt, job.clientTimeZone, language)}.${orientation ? ` ${orientation}` : ''}${practiceName ? `\n${practiceName}` : ''}`;
}
