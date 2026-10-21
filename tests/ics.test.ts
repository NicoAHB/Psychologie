import test from 'node:test';
import assert from 'node:assert/strict';
import { foldLine, icsCalendar } from '../src/lib/ics';

test('calendar export uses UTC instants, escapes text and ends every line with CRLF', () => {
  const text = icsCalendar([{ uid: 'abc', start: '2026-07-15T16:00:00Z', end: '2026-07-15T16:50:00Z', summary: 'Termin; Praxis, Berlin', description: 'Zeile 1\nZeile 2' }], 'Praxis', '2026-07-01T08:00:00.000Z');
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n') && text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(text.includes('DTSTART:20260715T160000Z\r\n') && text.includes('DTEND:20260715T165000Z\r\n') && text.includes('DTSTAMP:20260701T080000Z\r\n'));
  assert.ok(text.includes('SUMMARY:Termin\; Praxis\\, Berlin\r\n') && text.includes('DESCRIPTION:Zeile 1\\nZeile 2\r\n'));
  assert.equal(text.split('\r\n').every(line => !/[\r\n]/.test(line)), true);
});
test('long lines fold at 75 octets without splitting multi-byte characters', () => {
  const folded = foldLine(`SUMMARY:${'Нагадування про зустріч '.repeat(8)}`);
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replaceAll('\r\n ', ''), `SUMMARY:${'Нагадування про зустріч '.repeat(8)}`);
  assert.equal(foldLine('short'), 'short');
});
