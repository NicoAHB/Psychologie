import test from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, weekBlocks } from '../src/lib/calendar';
import { uid, type Appointment } from '../src/lib/types';

const appt = (date: string, time: string, duration = 50, timeZone = 'Europe/Berlin'): Appointment => ({ id: uid(), clientId: uid(), date, time, duration, feeCents: 0, timeZone, reminderId: uid(), status: 'scheduled' });
test('weeks start on Monday, including Sundays and year boundaries', () => {
  assert.equal(mondayOf('2026-07-15'), '2026-07-13'); assert.equal(mondayOf('2026-07-13'), '2026-07-13'); assert.equal(mondayOf('2026-07-19'), '2026-07-13');
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
});
test('week blocks sit in the practice zone even when the appointment was agreed in the client zone', () => {
  const blocks = weekBlocks([appt('2026-07-15', '19:00', 50, 'Europe/Kyiv'), appt('2026-07-20', '10:00')], '2026-07-13', 'Europe/Berlin', 'de');
  assert.equal(blocks.length, 1); assert.equal(blocks[0].day, 2); assert.equal(blocks[0].time, '18:00'); assert.equal(blocks[0].start, 18 * 60);
});
test('an appointment late in the evening in Kyiv can fall on another day in the practice zone', () => {
  const [block] = weekBlocks([appt('2026-07-14', '00:30', 50, 'Europe/Kyiv')], '2026-07-13', 'Europe/Berlin', 'de');
  assert.equal(block.day, 0); assert.equal(block.time, '23:30'); assert.equal(block.end, 1440);
});
test('overlapping appointments are split into lanes, back-to-back ones are not', () => {
  const blocks = weekBlocks([appt('2026-07-13', '10:00'), appt('2026-07-13', '10:30'), appt('2026-07-13', '10:50')], '2026-07-13', 'Europe/Berlin', 'de');
  assert.deepEqual(blocks.map(b => b.lane), [0, 1, 0]); assert.ok(blocks.every(b => b.lanes === 2));
});
