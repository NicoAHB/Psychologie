import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';
import { addDays, appointmentInstant, reminderExpiration, reminderInstant, today, zonedInstant } from '../src/lib/dates';

// The app no longer ships a Temporal polyfill; it stays a dev dependency as the reference implementation.
const oracle = (date: string, time: string, timeZone: string) => Temporal.PlainDate.from(date).toZonedDateTime({ timeZone, plainTime: time }).toInstant().toString();
const zones = ['Europe/Berlin', 'Europe/Kyiv', 'Europe/Vienna', 'Europe/Zurich'];

test('zoned instants match the Temporal reference on every day of three years, including DST edges', () => {
  for (const zone of zones) {
    for (let day = 0; day < 3 * 366; day++) {
      const date = Temporal.PlainDate.from('2025-01-01').add({ days: day }).toString();
      for (const time of ['00:00', '01:30', '02:30', '03:00', '03:30', '12:00', '18:00', '23:59'])
        assert.equal(zonedInstant(date, time, zone), oracle(date, time, zone), `${zone} ${date} ${time}`);
    }
  }
});
test('skipped and repeated wall-clock times resolve like Temporal "compatible"', () => {
  assert.equal(zonedInstant('2026-03-29', '02:30', 'Europe/Berlin'), '2026-03-29T01:30:00Z'); // skipped hour moves forward
  assert.equal(zonedInstant('2026-10-25', '02:30', 'Europe/Berlin'), '2026-10-25T00:30:00Z'); // repeated hour uses the first pass
});
test('reminder helpers still use the previous day at 18:00 and local midnight expiry', () => {
  for (const zone of zones) for (const date of ['2026-03-30', '2026-03-29', '2026-10-26', '2026-10-25', '2027-01-01', '2028-02-29']) {
    assert.equal(reminderInstant({ date, timeZone: zone }), oracle(Temporal.PlainDate.from(date).subtract({ days: 1 }).toString(), '18:00', zone));
    assert.equal(reminderExpiration({ date, timeZone: zone }), oracle(date, '00:00', zone));
    assert.equal(appointmentInstant({ date, time: '09:15', timeZone: zone }), oracle(date, '09:15', zone));
  }
});
test('invalid calendar dates are rejected instead of silently rolling over', () => {
  assert.throws(() => zonedInstant('2026-02-30', '10:00', 'Europe/Berlin'), /invalidDate/);
  assert.throws(() => zonedInstant('', '10:00', 'Europe/Berlin'));
});
test('date arithmetic crosses month, year and leap-day boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-03-31', -31), '2026-02-28'); assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
