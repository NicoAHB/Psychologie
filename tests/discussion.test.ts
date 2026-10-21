import test from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, excerpt, homeworkMessage, overviewOf, pendingHomework } from '../src/lib/discussion';
import { deleteSession } from '../src/lib/records';
import { searchVault } from '../src/lib/search';
import { emptyVault, uid, type Appointment, type Client, type Session, type VaultData } from '../src/lib/types';

const client = (language: 'de' | 'uk' = 'de', timeZone?: string): Client => ({ id: uid(), name: 'Olena K.', contact: '', preparation: '', telegramChatId: '', language, reminderConsent: false, createdAt: '2026-01-01', timeZone });
const session = (clientId: string, date: string, extra: Partial<Session> = {}): Session => ({ id: uid(), clientId, date, time: '10:00', feeCents: 8500, paidAt: null, notes: '', tags: [], ...extra });
function sample(): { data: VaultData; c: Client } {
  const data = emptyVault(); const c = client('uk', 'Europe/Kyiv'); data.clients.push(c);
  data.sessions.push(session(c.id, '2026-03-01', { notes: 'Erstgespräch', tags: ['Schlaf'], homework: 'Schlaftagebuch führen', paidAt: '2026-03-02' }),
    session(c.id, '2026-03-15', { tags: ['Schlaf', 'Arbeit'], homework: 'Spaziergang', homeworkDone: true }), session(c.id, '2026-04-01', { tags: ['Arbeit'], homework: 'Atemübung 2x täglich' }), session(c.id, '2026-04-10'));
  data.notes.push({ id: uid(), clientId: c.id, blobId: uid(), createdAt: '2026-04-01T10:00:00Z', tags: ['Arbeit'], caption: '' }, { id: uid(), clientId: c.id, blobId: uid(), createdAt: '2026-03-01T10:00:00Z', tags: ['Schlaf'], caption: '', sessionId: data.sessions[0].id });
  return { data, c };
}
test('the overview collects recent sessions, open homework, recurring themes and unpaid amounts', () => {
  const { data, c } = sample(); const next: Appointment = { id: uid(), clientId: c.id, date: '2026-04-20', time: '18:00', duration: 50, feeCents: 8500, timeZone: 'Europe/Berlin', reminderId: uid(), status: 'scheduled' };
  data.appointments.push(next, { ...next, id: uid(), date: '2026-04-05', status: 'cancelled' }, { ...next, id: uid(), date: '2026-04-30' }, { ...next, id: uid(), date: '2026-01-05' });
  const o = overviewOf(data, c.id, Date.parse('2026-04-12T12:00:00Z'));
  assert.deepEqual(o.recent.map(s => s.date), ['2026-04-10', '2026-04-01', '2026-03-15']); assert.equal(o.lastSession!.date, '2026-04-10');
  assert.deepEqual(o.openHomework.map(s => s.homework), ['Atemübung 2x täglich', 'Schlaftagebuch führen']);
  assert.deepEqual(o.threads, [['Arbeit', 3], ['Schlaf', 2]]); assert.equal(o.unpaidCents, 3 * 8500); assert.equal(o.nextAppointment!.date, '2026-04-20');
  assert.equal(overviewOf(emptyVault(), uid()).lastSession, undefined);
});
test('the previous unreviewed homework is offered for the next session, except the one being edited', () => {
  const { data, c } = sample(); assert.equal(pendingHomework(data, c.id)!.homework, 'Atemübung 2x täglich');
  assert.equal(pendingHomework(data, c.id, data.sessions[2].id)!.homework, 'Schlaftagebuch führen');
  data.sessions.forEach(s => { s.homeworkDone = true; }); assert.equal(pendingHomework(data, c.id), undefined);
});
test('homework message uses the client language and local time, and mentions the practice time for orientation', () => {
  const { data, c } = sample(); const next: Appointment = { id: uid(), clientId: c.id, date: '2026-07-15', time: '18:00', duration: 50, feeCents: 0, timeZone: 'Europe/Berlin', reminderId: uid(), status: 'scheduled' };
  const text = homeworkMessage(c, data.sessions[2], next, { timeZone: 'Europe/Berlin' });
  assert.ok(text.startsWith('Домашнє завдання до нашої наступної зустрічі:\nAtemübung 2x täglich\n\nНаступна зустріч: середа, 15 липня 2026 р., 19:00 (Київ, UTC+3). Для довідки — Берлін: 18:00 (UTC+2).'));
  assert.equal(homeworkMessage({ ...c, language: 'de', timeZone: undefined }, data.sessions[2], undefined, { timeZone: 'Europe/Berlin' }), 'Hausaufgabe bis zu unserem nächsten Termin:\nAtemübung 2x täglich');
});
test('deleting a session takes its attached photos with it; homework is searchable', () => {
  const { data, c } = sample(); const target = data.sessions[2]; data.notes.push({ id: uid(), clientId: c.id, blobId: uid(), createdAt: '2026-04-01T11:00:00Z', tags: [], caption: 'Notizzettel', sessionId: target.id });
  assert.equal(searchVault(data, 'atemubung').length, 1);
  deleteSession(data, target.id); assert.equal(data.notes.some(n => n.sessionId === target.id), false); assert.equal(data.notes.length, 2); // the standalone note and the photo of another session stay
});
test('excerpts stay short, keep whole words and day counts never go negative', () => {
  assert.equal(excerpt('kurz  und\n knapp'), 'kurz und knapp'); const long = excerpt('wort '.repeat(100), 60); assert.ok(long.length <= 64 && long.endsWith(' …') && !long.includes('wor …'));
  assert.equal(daysSince('2026-04-10', '2026-04-17'), 7); assert.equal(daysSince('2026-04-20', '2026-04-17'), 0);
});
