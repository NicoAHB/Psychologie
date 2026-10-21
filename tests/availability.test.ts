import test from 'node:test';
import assert from 'node:assert/strict';
import { absenceRange, conflictsWithAbsence, dayAbsences } from '../src/lib/availability';
import { normalizeVault, emptyVault, uid, type Appointment, type CalendarAbsence } from '../src/lib/types';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { latestChange, hasRecords } from '../src/lib/backupState';

const absence = (extra: Partial<CalendarAbsence> = {}): CalendarAbsence => ({ id: uid(), kind: 'vacation', title: 'Urlaub', fromDate: '2026-10-24', untilDate: '2026-10-26', allDay: true, timeZone: 'Europe/Berlin', ...extra });
const appointment = (extra: Partial<Appointment> = {}): Appointment => ({ id: uid(), clientId: 'client', date: '2026-10-25', time: '14:00', duration: 50, timeZone: 'Europe/Kyiv', feeCents: 8500, reminderId: uid(), status: 'scheduled', ...extra });
test('all-day ranges include the final civil day and respect both daylight-saving transitions', () => {
  const autumn = absenceRange(absence()); assert.equal(new Date(autumn.start).toISOString(), '2026-10-23T22:00:00.000Z'); assert.equal(new Date(autumn.end).toISOString(), '2026-10-26T23:00:00.000Z'); assert.equal((autumn.end - autumn.start) / 3600000, 73);
  const spring = absenceRange(absence({ fromDate: '2026-03-29', untilDate: '2026-03-29' })); assert.equal((spring.end - spring.start) / 3600000, 23);
  assert.equal(dayAbsences([absence()], '2026-10-26', 'Europe/Berlin', 'de')[0].fullDay, true); assert.equal(dayAbsences([absence()], '2026-10-27', 'Europe/Berlin', 'de').length, 0);
});
test('timed blocks warn across client zones, use half-open boundaries, and ignore cancelled appointments', () => {
  const block = absence({ fromDate: '2026-10-25', untilDate: '2026-10-25', allDay: false, startTime: '13:00', endTime: '14:00' });
  assert.equal(conflictsWithAbsence(appointment(), block), true); // Kyiv 14:00 = Berlin 13:00.
  assert.equal(conflictsWithAbsence(appointment({ time: '15:00' }), block), false); assert.equal(conflictsWithAbsence(appointment({ time: '13:10' }), block), false); assert.equal(conflictsWithAbsence(appointment({ status: 'cancelled' }), block), false);
  const segment = dayAbsences([block], '2026-10-25', 'Europe/Berlin', 'uk')[0]; assert.equal(segment.start, 780); assert.equal(segment.end, 840); assert.equal(segment.fullDay, false);
});
test('invalid and reversed dates, times and zones cannot be saved', () => {
  for (const extra of [{ untilDate: '2026-10-23' }, { fromDate: '2026-02-30' }, { timeZone: 'Invalid/Zone' }, { allDay: false, startTime: '24:00', endTime: '15:00' }, { allDay: false, startTime: '15:00', endTime: '14:00', untilDate: '2026-10-24' }]) assert.throws(() => absenceRange(absence(extra)), /availabilityInvalid/);
});
test('absence records migrate, participate in backups and merge with deletion tombstones independently of clients', () => {
  const local = emptyVault(); const before = structuredClone(local); local.availability.push(absence()); stampChanges(before, local, 100); assert.equal(latestChange(local), 100); assert.equal(hasRecords(local), true);
  const remote = structuredClone(local); remote.availability[0].title = 'Changed on tablet'; stampChanges(local, remote, 200); const merged = mergeVaults(local, remote); assert.equal(merged.availability[0].title, 'Changed on tablet');
  const removed = structuredClone(merged); removed.availability = []; stampChanges(merged, removed, 300); assert.equal(mergeVaults(local, removed).availability.length, 0);
  const legacy = emptyVault(); delete (legacy as Partial<typeof legacy>).availability; assert.deepEqual(normalizeVault(legacy).availability, []);
});
