import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMemoLabel, editMemoMetadata, memoLabelChoices, memoLabelKey, rememberMemoLabel, visibleMemoLabelChoices } from '../src/lib/memoLabels';
import { emptyVault, uid, type VaultData } from '../src/lib/types';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { syncConflicts } from '../src/lib/crdt';
import { decryptVault, encryptVault, randomSalt } from '../src/lib/crypto';

test('built-in memo labels translate to DE/UA while custom vocabulary stays verbatim and deduplicated', () => {
  const labels = ['  Eigener   Fokus ', 'eigener fokus', 'Власна назва', 'Ressourcen & Stärken'];
  const de = memoLabelChoices(labels, 'de'), uk = memoLabelChoices(labels, 'uk');
  assert.equal(de.filter(choice => choice.builtIn).length, 8);
  assert.deepEqual(de.map(choice => choice.id), uk.map(choice => choice.id));
  assert.equal(de[0].label, 'Gedanken nach der Sitzung'); assert.equal(uk[0].label, 'Думки після сесії');
  assert.deepEqual(de.filter(choice => !choice.builtIn).map(choice => choice.label), ['Eigener Fokus', 'Власна назва']);
  assert.deepEqual(uk.filter(choice => !choice.builtIn), de.filter(choice => !choice.builtIn));
  assert.equal(cleanMemoLabel('  Mein\n  Thema '), 'Mein Thema'); assert.equal(memoLabelKey('A\u0308ngste'), memoLabelKey('ÄNGSTE'));
});
test('only new custom labels are learned on save, including normalization, empty labels and length limits', () => {
  const data = emptyVault();
  for (const value of ['', '  ', 'Ressourcen & Stärken', 'Ресурси та сильні сторони']) rememberMemoLabel(data, value);
  assert.equal(data.settings.memoLabels, undefined);
  rememberMemoLabel(data, '  Mein   Thema '); rememberMemoLabel(data, 'mein thema');
  assert.deepEqual(data.settings.memoLabels, ['Mein Thema']);
  assert.throws(() => rememberMemoLabel(data, 'x'.repeat(121)), /memoTextLimit/);
});
const edit = (before: VaultData, actor: string, change: (data: VaultData) => void) => { const after = structuredClone(before); change(after); stampChanges(before, after, 100, actor); return after; };
test('offline vocabulary additions merge as independent set entries without a last-write-wins array conflict', () => {
  const base = emptyVault(); rememberMemoLabel(base, 'Gemeinsam');
  const a = edit(base, 'laptop', data => rememberMemoLabel(data, 'Laptop-Begriff'));
  const b = edit(base, 'tablet', data => rememberMemoLabel(data, 'Tablet-Begriff'));
  const result = mergeVaults(a, b);
  assert.deepEqual(result.settings.memoLabels!.sort(), ['Gemeinsam', 'Laptop-Begriff', 'Tablet-Begriff']);
  assert.deepEqual(mergeVaults(a, b), mergeVaults(b, a)); assert.equal(syncConflicts(result).length, 0);
  const erased = edit(result, 'laptop', data => { data.settings.memoLabels = data.settings.memoLabels!.filter(value => value !== 'Gemeinsam'); });
  const added = edit(result, 'tablet', data => rememberMemoLabel(data, 'Weiterer Begriff'));
  const again = mergeVaults(erased, added);
  assert.ok(!again.settings.memoLabels!.includes('Gemeinsam')); assert.ok(again.settings.memoLabels!.includes('Weiterer Begriff'));
  assert.ok(!mergeVaults(again, result).settings.memoLabels!.includes('Gemeinsam'));
  const cleared = edit(again, 'laptop', data => { data.settings.memoLabels = []; });
  assert.deepEqual(mergeVaults(cleared, again).settings.memoLabels, []);
});
test('large title vocabularies stay bounded and an older custom title can still be found or kept selected', () => {
  const choices = memoLabelChoices(Array.from({ length: 1000 }, (_, i) => `Eigenes Thema ${String(i).padStart(4, '0')}`), 'de');
  assert.equal(visibleMemoLabelChoices(choices, '').length, 58);
  assert.equal(visibleMemoLabelChoices(choices, '0999').at(-1)!.label, 'Eigenes Thema 0999');
  assert.ok(visibleMemoLabelChoices(choices, 'Eigenes Thema 0999').some(choice => choice.label === 'Eigenes Thema 0999'));
  assert.ok(visibleMemoLabelChoices(choices, 'Eigenes Thema 0999').length <= 59);
});
test('custom memo labels survive encrypted backup round trips; legacy vaults have no required new field', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const old = emptyVault(); const legacyEnvelope = await encryptVault(key, old, uid(), randomSalt());
  assert.deepEqual(memoLabelChoices((await decryptVault(key, legacyEnvelope)).settings.memoLabels, 'de'), memoLabelChoices(undefined, 'de'));
  rememberMemoLabel(old, 'PRIVATE CUSTOM VOCABULARY'); const envelope = await encryptVault(key, old, uid(), randomSalt());
  assert.doesNotMatch(JSON.stringify(envelope), /PRIVATE CUSTOM/);
  assert.deepEqual((await decryptVault(key, JSON.parse(JSON.stringify(envelope)))).settings.memoLabels, ['PRIVATE CUSTOM VOCABULARY']);
});
test('renaming a saved memo learns its new label, while editing only a summary leaves the vocabulary untouched', () => {
  const data = emptyVault(); data.audioMemos.push({ id: 'memo', clientId: 'client', sessionId: 'session', blobId: 'file', size: 4, durationMs: 1000, mimeType: 'audio/webm', createdAt: '2026-10-22T10:00:00Z', label: 'Old label', summary: '' });
  editMemoMetadata(data, 'memo', { label: 'Old label', summary: 'New summary' }); assert.equal(data.settings.memoLabels, undefined);
  editMemoMetadata(data, 'memo', { label: 'New label', summary: 'New summary' }); assert.deepEqual(data.settings.memoLabels, ['New label']);
  assert.equal(data.audioMemos[0].blobId, 'file');
  assert.throws(() => editMemoMetadata(data, 'memo', { label: 'Invalid label', summary: 'x'.repeat(2001) }), /memoTextLimit/);
  assert.deepEqual(data.settings.memoLabels, ['New label']);
});
