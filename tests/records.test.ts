import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteClient, deleteNote, deleteSession, feeText, findConflict, orphanedBlobs, suggestedFee } from '../src/lib/records';
import { referencedBlobs } from '../src/lib/blobs';
import { emptyVault, uid, type Appointment, type VaultData } from '../src/lib/types';

function sample() {
  const data = emptyVault(); const ids = { a: uid(), b: uid(), avatar: uid(), photoA: uid(), photoB: uid() };
  const base = { contact: '', preparation: '', telegramChatId: '', language: 'de' as const, reminderConsent: false, createdAt: '2026-01-01' };
  data.clients.push({ ...base, id: ids.a, name: 'A', avatarId: ids.avatar }, { ...base, id: ids.b, name: 'B' });
  const appointment: Appointment = { id: uid(), clientId: ids.a, date: '2026-05-04', time: '10:00', duration: 50, feeCents: 9000, timeZone: 'Europe/Berlin', reminderId: uid(), status: 'completed' };
  data.appointments.push(appointment, { ...appointment, id: uid(), clientId: ids.b, status: 'scheduled' });
  data.sessions.push({ id: uid(), clientId: ids.a, date: '2026-05-04', time: '10:00', feeCents: 9000, paidAt: null, notes: '', tags: [], appointmentId: appointment.id },
    { id: uid(), clientId: ids.b, date: '2026-05-05', time: '10:00', feeCents: 7000, paidAt: null, notes: '', tags: [] });
  data.notes.push({ id: uid(), clientId: ids.a, blobId: ids.photoA, createdAt: '2026-05-04T10:00:00Z', tags: [], caption: '' }, { id: uid(), clientId: ids.b, blobId: ids.photoB, createdAt: '2026-05-05T10:00:00Z', tags: [], caption: '' });
  return { data, ids, appointment };
}
test('deleting a client removes every dependent record and orphans exactly that client\'s images', () => {
  const { data, ids } = sample(); const before = referencedBlobs(data);
  deleteClient(data, ids.a);
  assert.deepEqual(data.clients.map(c => c.id), [ids.b]);
  assert.ok([data.appointments, data.sessions, data.notes].every(list => list.every(r => r.clientId === ids.b)));
  assert.deepEqual(orphanedBlobs(before, data).sort(), [ids.avatar, ids.photoA].sort());
  assert.deepEqual(referencedBlobs(data), [ids.photoB]);
});
test('deleting a session re-opens its completed appointment; deleting a note orphans its photo', () => {
  const { data, appointment, ids } = sample(); const before = referencedBlobs(data);
  deleteSession(data, data.sessions[0].id);
  assert.equal(data.appointments.find(a => a.id === appointment.id)!.status, 'scheduled'); assert.equal(data.sessions.length, 1);
  deleteNote(data, data.notes[1].id); assert.deepEqual(orphanedBlobs(before, data), [ids.photoB]);
});
test('an image shared by two records is only orphaned when the last reference disappears', () => {
  const { data, ids } = sample(); data.notes.push({ ...data.notes[0], id: uid() }); const before = referencedBlobs(data);
  deleteNote(data, data.notes[0].id); assert.deepEqual(orphanedBlobs(before, data), []);
});
test("double-booking detection: overlap, adjacency, other days, other zones, cancelled and self", () => {
  const { data } = sample(); const existing = data.appointments[1]; // B, 2026-05-04 10:00, 50 min, scheduled
  const probe = (time: string, duration = 50, date = existing.date, id = '', timeZone = 'Europe/Berlin') => findConflict(data.appointments, { id, date, time, duration, timeZone });
  assert.equal(probe('10:30'), existing); assert.equal(probe('09:30', 40), existing); assert.equal(probe('09:00', 120), existing);
  assert.equal(probe('10:50'), undefined); assert.equal(probe('09:10', 50), undefined); assert.equal(probe('10:30', 50, '2026-05-05'), undefined);
  assert.equal(probe('10:30', 50, existing.date, existing.id), undefined);
  assert.equal(probe('11:30', 50, existing.date, '', 'Europe/Kyiv'), existing); // 11:30 Kyiv is 10:30 Berlin
  assert.equal(probe('09:00', 50, existing.date, '', 'Europe/Kyiv'), undefined); // 09:00 Kyiv is 08:00 Berlin, ends before 10:00
  existing.status = 'cancelled'; assert.equal(probe('10:30'), undefined);
});
test('fee suggestion follows the latest session or appointment of that client', () => {
  const { data, ids } = sample();
  assert.equal(suggestedFee(data, ids.b), 7000 /* B's session on 2026-05-05 is newer than the appointment on 05-04 */);
  assert.equal(suggestedFee(data, uid()), 8500); assert.equal(suggestedFee(emptyVault() as VaultData, ids.a, 1234), 1234);
  assert.equal(feeText(9050), '90,50'); assert.equal(feeText(8500), '85,00');
});
