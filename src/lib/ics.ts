// iCalendar (RFC 5545) export. Times are written as UTC instants, so every calendar app shows the correct local
// time in the viewer's own time zone - the safest way to avoid mix-ups between zones.
export interface IcsEvent { uid: string; start: string; end: string; summary: string; description?: string }
const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
/** Lines may not exceed 75 octets; continuation lines start with a space. Cuts never split a UTF-8 character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder(); const out: string[] = []; let current = ''; let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length; const limit = out.length === 0 ? 75 : 74;
    if (size + width > limit) { out.push(current); current = ''; size = 0; }
    current += char; size += width;
  }
  out.push(current);
  return out.map((part, i) => i ? ` ${part}` : part).join('\r\n');
}
export function icsCalendar(events: IcsEvent[], calendarName: string, now = new Date().toISOString()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Praxisraum//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(calendarName)}`];
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${event.uid}@praxisraum`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`, `SUMMARY:${escapeText(event.summary)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
