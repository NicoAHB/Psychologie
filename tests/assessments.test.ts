import test from 'node:test';
import assert from 'node:assert/strict';
import { changeSincePrevious, history, INSTRUMENTS, isComplete, needsAttention, scoreOf, severityOf } from '../src/lib/assessments';
import de from '../src/locales/de.json';
import uk from '../src/locales/uk.json';
import { uid, type Assessment } from '../src/lib/types';

const entry = (kind: 'phq9' | 'gad7', date: string, fill: number, clientId = 'c'): Assessment => ({ id: uid(), clientId, kind, date, answers: Array(INSTRUMENTS[kind].items).fill(fill), note: '' });
test('scores add up and severity bands follow the published cut-offs', () => {
  assert.equal(scoreOf('phq9', Array(9).fill(3)), 27); assert.equal(scoreOf('gad7', Array(7).fill(3)), 21); assert.equal(scoreOf('gad7', Array(7).fill(0)), 0);
  const phq = [[0, 'minimal'], [4, 'minimal'], [5, 'mild'], [9, 'mild'], [10, 'moderate'], [14, 'moderate'], [15, 'moderatelySevere'], [19, 'moderatelySevere'], [20, 'severe'], [27, 'severe']] as const;
  for (const [total, band] of phq) assert.equal(severityOf('phq9', total), band, `PHQ-9 ${total}`);
  const gad = [[4, 'minimal'], [5, 'mild'], [9, 'mild'], [10, 'moderate'], [14, 'moderate'], [15, 'severe'], [21, 'severe']] as const;
  for (const [total, band] of gad) assert.equal(severityOf('gad7', total), band, `GAD-7 ${total}`);
});
test('incomplete or out-of-range answers are rejected', () => {
  assert.equal(isComplete('phq9', Array(8).fill(1)), false); assert.equal(isComplete('phq9', [...Array(8).fill(1), null]), false); assert.equal(isComplete('gad7', [...Array(6).fill(1), 4]), false);
  assert.throws(() => scoreOf('phq9', Array(9).fill(4)), /incompleteAssessment/); assert.throws(() => scoreOf('gad7', Array(9).fill(1)), /incompleteAssessment/);
});
test('only a positive answer to PHQ-9 item 9 raises the safety flag', () => {
  const answers = Array(9).fill(0); assert.equal(needsAttention('phq9', answers), false); answers[8] = 1; assert.equal(needsAttention('phq9', answers), true);
  assert.equal(needsAttention('gad7', Array(7).fill(3)), false); assert.equal(needsAttention('phq9', [3, 3, 3, 3, 3, 3, 3, 3, 0]), false);
});
test('history is ordered by date per client and instrument, and reports the change to the previous result', () => {
  const list = [entry('phq9', '2026-03-01', 2), entry('phq9', '2026-01-01', 3), entry('gad7', '2026-02-01', 1), entry('phq9', '2026-02-01', 1, 'other')];
  const mine = history(list, 'c', 'phq9'); assert.deepEqual(mine.map(a => a.date), ['2026-01-01', '2026-03-01']);
  assert.equal(changeSincePrevious(mine), 18 - 27); assert.equal(changeSincePrevious(mine.slice(1)), null);
});
test('every item, answer and band of both instruments is translated into German and Ukrainian', () => {
  const keys = [...Array.from({ length: 9 }, (_, i) => `phq9_${i + 1}`), ...Array.from({ length: 7 }, (_, i) => `gad7_${i + 1}`), 'answer0', 'answer1', 'answer2', 'answer3',
    ...['minimal', 'mild', 'moderate', 'moderatelySevere', 'severe'].map(b => `sev_${b}`)];
  for (const key of keys) for (const dictionary of [de, uk] as Record<string, string>[]) assert.ok(dictionary[key]?.trim(), key);
});
