import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, searchVault } from '../src/lib/search';
import { emptyVault, uid, type VaultData } from '../src/lib/types';

function sample(): VaultData {
  const data = emptyVault(); const anna = uid(); const olena = uid();
  const base = { contact: '', preparation: '', telegramChatId: '', language: 'de' as const, reminderConsent: false, createdAt: '2026-01-01' };
  data.clients.push({ ...base, id: anna, name: 'Anna Müller', preparation: 'Straße der Ressourcen noch einmal ansehen' }, { ...base, id: olena, name: 'Олена Ковальчук', language: 'uk' });
  data.sessions.push({ id: uid(), clientId: anna, date: '2026-03-02', time: '10:00', feeCents: 8500, paidAt: null, notes: 'Gespräch über Schlafprobleme und Grübeln', tags: ['Schlaf', 'Fortschritt'] },
    { id: uid(), clientId: olena, date: '2026-04-02', time: '10:00', feeCents: 8500, paidAt: null, notes: 'Тривога та сон; техніки дихання', tags: ['Ресурси'] });
  data.notes.push({ id: uid(), clientId: anna, blobId: uid(), createdAt: '2026-05-01T10:00:00Z', tags: ['Skizze'], caption: 'Wochenplan' });
  return data;
}
test('folding ignores case and accents, treats ß as ss and keeps Cyrillic searchable', () => {
  assert.equal(fold('Müller STRAẞE Straße').folded, 'muller strasse strasse'); assert.equal(fold('ЇЖАК').folded, 'іжак');
  assert.deepEqual(fold('Äb').map, [0, 1]);
});
test('search finds names, notes, tags, preparation and photo captions across both alphabets', () => {
  const data = sample();
  assert.equal(searchVault(data, 'muller')[0].title, 'Anna Müller'); assert.equal(searchVault(data, 'MÜLLER')[0].kind, 'client');
  assert.deepEqual(searchVault(data, 'schlaf').map(h => h.kind).sort(), ['session']);
  assert.equal(searchVault(data, '#fortschritt').length, 1); assert.equal(searchVault(data, 'strasse ressourcen')[0].kind, 'client');
  assert.equal(searchVault(data, 'wochenplan')[0].kind, 'note'); assert.equal(searchVault(data, 'тривога')[0].title, 'Олена Ковальчук');
  assert.equal(searchVault(data, 'ковальчук')[0].kind, 'client'); assert.equal(searchVault(data, 'nirgends').length, 0); assert.equal(searchVault(data, '   ').length, 0);
});
test('all words must match, and excerpts mark them where they occur', () => {
  const data = sample(); assert.equal(searchVault(data, 'schlaf grübeln').length, 1); assert.equal(searchVault(data, 'schlaf dichter').length, 0);
  const [hit] = searchVault(data, 'grübeln'); const [from, to] = hit.marks[0]; assert.equal(hit.text.slice(from, to), 'Grübeln');
});
test('long texts are cut around the first match', () => {
  const data = sample(); data.clients[0].preparation = `${'x '.repeat(200)}Zielwort ${'y '.repeat(200)}`;
  const [hit] = searchVault(data, 'zielwort'); assert.ok(hit.text.length < 200 && hit.text.startsWith('… ') && hit.text.endsWith(' …'));
  const [from, to] = hit.marks[0]; assert.equal(hit.text.slice(from, to), 'Zielwort');
});
import { withTemplate } from '../src/lib/templates';
test('templates are appended below existing notes, separated by a blank line', () => {
  assert.equal(withTemplate('', 'S: \nO: '), 'S: \nO: '); assert.equal(withTemplate('Notiz\n', 'S: '), 'Notiz\n\nS: '); assert.equal(withTemplate('   ', 'S: '), 'S: ');
});
