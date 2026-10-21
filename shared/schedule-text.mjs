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
// Country of each common zone, so people see "Kiew (Ukraine)" rather than only a city or an offset.
const COUNTRIES = {
  'Europe/Berlin': ['DE', 'Deutschland', 'Німеччина'], 'Europe/Kyiv': ['UA', 'Ukraine', 'Україна'], 'Europe/Kiev': ['UA', 'Ukraine', 'Україна'], 'Europe/Vienna': ['AT', 'Österreich', 'Австрія'],
  'Europe/Zurich': ['CH', 'Schweiz', 'Швейцарія'], 'Europe/Warsaw': ['PL', 'Polen', 'Польща'], 'Europe/Prague': ['CZ', 'Tschechien', 'Чехія'], 'Europe/Budapest': ['HU', 'Ungarn', 'Угорщина'],
  'Europe/Bucharest': ['RO', 'Rumänien', 'Румунія'], 'Europe/Chisinau': ['MD', 'Moldau', 'Молдова'], 'Europe/London': ['GB', 'Vereinigtes Königreich', 'Велика Британія'], 'Europe/Dublin': ['IE', 'Irland', 'Ірландія'],
  'Europe/Lisbon': ['PT', 'Portugal', 'Португалія'], 'Europe/Madrid': ['ES', 'Spanien', 'Іспанія'], 'Europe/Paris': ['FR', 'Frankreich', 'Франція'], 'Europe/Rome': ['IT', 'Italien', 'Італія'],
  'Europe/Amsterdam': ['NL', 'Niederlande', 'Нідерланди'], 'Europe/Brussels': ['BE', 'Belgien', 'Бельгія'], 'Europe/Copenhagen': ['DK', 'Dänemark', 'Данія'], 'Europe/Stockholm': ['SE', 'Schweden', 'Швеція'],
  'Europe/Oslo': ['NO', 'Norwegen', 'Норвегія'], 'Europe/Helsinki': ['FI', 'Finnland', 'Фінляндія'], 'Europe/Vilnius': ['LT', 'Litauen', 'Литва'], 'Europe/Riga': ['LV', 'Lettland', 'Латвія'],
  'Europe/Tallinn': ['EE', 'Estland', 'Естонія'], 'Europe/Athens': ['GR', 'Griechenland', 'Греція'], 'Europe/Istanbul': ['TR', 'Türkei', 'Туреччина'], 'Europe/Sofia': ['BG', 'Bulgarien', 'Болгарія'],
  'Europe/Belgrade': ['RS', 'Serbien', 'Сербія'], 'Europe/Zagreb': ['HR', 'Kroatien', 'Хорватія'], 'Europe/Bratislava': ['SK', 'Slowakei', 'Словаччина'], 'Europe/Luxembourg': ['LU', 'Luxemburg', 'Люксембург'],
  'Europe/Minsk': ['BY', 'Belarus', 'Білорусь'], 'America/New_York': ['US', 'USA', 'США'], 'America/Toronto': ['CA', 'Kanada', 'Канада'], 'America/Chicago': ['US', 'USA', 'США'],
  'America/Los_Angeles': ['US', 'USA', 'США'], 'Asia/Dubai': ['AE', 'Vereinigte Arabische Emirate', 'ОАЕ'], 'Asia/Jerusalem': ['IL', 'Israel', 'Ізраїль'],
};
/** Two-letter country code of a zone ("UA"), or '' when unknown. */
export const zoneCountryCode = zone => COUNTRIES[zone]?.[0] ?? '';
/** Country name in the given language, or '' when unknown. */
export const zoneCountry = (zone, language) => COUNTRIES[zone]?.[language === 'uk' ? 2 : 1] ?? '';
export function zonePlace(zone, language) {
  const country = zoneCountry(zone, language);
  return country ? `${zoneCity(zone, language)}, ${country}` : zoneCity(zone, language);
}
/** Whole days the clock reading of `zone` is ahead of (+1) or behind (-1) `reference` at that instant. */
export function dayShift(instant, zone, reference) {
  const a = localParts(instant, zone, 'de').iso; const b = localParts(instant, reference, 'de').iso;
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
}
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
