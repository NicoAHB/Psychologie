import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFollowUpReason, FOLLOW_UP_NOTE_MAX, FOLLOW_UP_REASONS } from '../src/lib/followUpReasons';
const de = JSON.parse(readFileSync(new URL('../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(readFileSync(new URL('../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
const presets = FOLLOW_UP_REASONS.flatMap(reason => [de[reason], uk[reason]]);

test('translated follow-up choices fill an empty note and replace an unmodified preset', () => {
  for (const dictionary of [de, uk]) for (const reason of FOLLOW_UP_REASONS) {
    assert.ok(dictionary[reason]);
    assert.equal(applyFollowUpReason('', dictionary[reason], presets), dictionary[reason]);
    assert.equal(applyFollowUpReason(de.followUpReasonReply, dictionary[reason], presets, [de[reason], uk[reason]]),
      reason === 'followUpReasonReply' ? de.followUpReasonReply : dictionary[reason]);
  }
});

test('manual text is retained verbatim and the chosen reason is added on a new line', () => {
  const own = 'Eigene Rücksprache: Freitag\nNotiz der Beraterin';
  assert.equal(applyFollowUpReason(own, de.followUpReasonPause, presets), `${own}\n${de.followUpReasonPause}`);
  assert.equal(applyFollowUpReason(own, '', presets), own);
});

test('choosing a reason twice, including after DE/UA switching, does not duplicate it', () => {
  const aliases = [de.followUpReasonPause, uk.followUpReasonPause];
  const existing = `Eigene Notiz\n${de.followUpReasonPause}`;
  assert.equal(applyFollowUpReason(existing, de.followUpReasonPause, presets, aliases), existing);
  assert.equal(applyFollowUpReason(existing, uk.followUpReasonPause, presets, aliases), existing);
});

test('the 500-character limit never truncates a manual note', () => {
  const note = 'x'.repeat(FOLLOW_UP_NOTE_MAX - de.followUpReasonReply.length - 1);
  assert.equal(applyFollowUpReason(note, de.followUpReasonReply, presets).length, FOLLOW_UP_NOTE_MAX);
  assert.throws(() => applyFollowUpReason(note + 'x', de.followUpReasonReply, presets), /followUpReasonTooLong/);
  assert.throws(() => applyFollowUpReason('', 'x'.repeat(FOLLOW_UP_NOTE_MAX + 1), presets), /followUpReasonTooLong/);
});
