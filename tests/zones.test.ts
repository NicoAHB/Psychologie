import test from 'node:test';
import assert from 'node:assert/strict';
import { dayShift, zoneCountry, zoneCountryCode, zonePlace } from '../shared/schedule-text.mjs';
import { appointmentView, timeAt, zoneTag } from '../src/lib/zones';
import { emptyVault, uid, type Appointment, type Client } from '../src/lib/types';

const settings = emptyVault().settings;
const client = (timeZone?: string): Client => ({ id: uid(), name: 'K', contact: '', preparation: '', telegramChatId: '', language: 'de', reminderConsent: false, createdAt: '2026-01-01', timeZone });
const appointment = (date: string, time: string, timeZone = 'Europe/Berlin'): Appointment => ({ id: uid(), clientId: uid(), date, time, duration: 50, feeCents: 0, timeZone, reminderId: uid(), status: 'scheduled' });

test('zones carry country names and codes in both languages', () => {
  assert.equal(zonePlace('Europe/Kyiv', 'de'), 'Kiew, Ukraine'); assert.equal(zonePlace('Europe/Berlin', 'uk'), 'Берлін, Німеччина'); assert.equal(zonePlace('Asia/Tokyo', 'de'), 'Tokyo');
  assert.equal(zoneCountryCode('Europe/Kyiv'), 'UA'); assert.equal(zoneCountry('Europe/Zurich', 'de'), 'Schweiz'); assert.equal(zoneTag('Asia/Tokyo', 'de'), 'TOK');
});
test('18:00 in Germany is 19:00 for a client in Ukraine, in summer and in winter', () => {
  for (const date of ['2026-07-15', '2026-12-15', '2026-03-28', '2026-03-30', '2026-10-26']) {
    const view = appointmentView(appointment(date, '18:00'), client('Europe/Kyiv'), settings, 'de');
    assert.equal(view.practice.time, '18:00', date); assert.equal(view.client.time, '19:00', date); assert.equal(view.differs, true); assert.equal(view.client.tag, 'UA'); assert.equal(view.practice.tag, 'DE');
  }
});
test('on the night both countries switch to winter time the pair stays exactly one hour apart', () => {
  const before = appointmentView(appointment('2026-10-25', '02:30'), client('Europe/Kyiv'), settings, 'de'); // repeated hour: first pass, still summer time
  assert.equal(before.practice.offset, 'UTC+2'); assert.equal(before.client.offset, 'UTC+3'); assert.equal(before.client.time, '03:30');
  const after = appointmentView(appointment('2026-10-25', '04:00'), client('Europe/Kyiv'), settings, 'de');
  assert.equal(after.practice.offset, 'UTC+1'); assert.equal(after.client.offset, 'UTC+2'); assert.equal(after.client.time, '05:00');
});
test('an appointment agreed in the client zone shows the practice time for the practitioner', () => {
  const view = appointmentView(appointment('2026-07-15', '19:00', 'Europe/Kyiv'), client('Europe/Kyiv'), settings, 'de');
  assert.equal(view.practice.time, '18:00'); assert.equal(view.client.time, '19:00');
});
test('late evening in Germany can already be the next day for the client, which is flagged', () => {
  const view = appointmentView(appointment('2026-07-15', '23:30'), client('Europe/Kyiv'), settings, 'de');
  assert.equal(view.client.time, '00:30'); assert.equal(view.client.shift, 1); assert.equal(view.client.iso, '2026-07-16'); assert.equal(view.practice.shift, 0);
  assert.equal(dayShift('2026-07-15T21:30:00Z', 'Europe/Kyiv', 'Europe/Berlin'), 1);
});
test('clients in the practice zone, or in a zone with the same clock, show a single time', () => {
  assert.equal(appointmentView(appointment('2026-07-15', '18:00'), client(), settings, 'de').differs, false);
  assert.equal(appointmentView(appointment('2026-07-15', '18:00'), client('Europe/Vienna'), settings, 'de').differs, false);
  assert.equal(appointmentView(appointment('2026-07-15', '18:00'), undefined, settings, 'de').differs, false);
  assert.equal(timeAt('2026-07-15T16:00:00Z', 'America/New_York', 'Europe/Berlin', 'de').time, '12:00');
});
