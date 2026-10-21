import type { Assessment, AssessmentKind } from './types';

// PHQ-9 (depression) and GAD-7 (anxiety) screening questionnaires, 4-point answers (0-3). Both are free to use.
// They are screening aids, not diagnoses; this module only scores, bands and orders them.
export interface Instrument { items: number; max: number; bands: { from: number; key: string }[] }
export const INSTRUMENTS: Record<AssessmentKind, Instrument> = {
  phq9: { items: 9, max: 27, bands: [{ from: 0, key: 'minimal' }, { from: 5, key: 'mild' }, { from: 10, key: 'moderate' }, { from: 15, key: 'moderatelySevere' }, { from: 20, key: 'severe' }] },
  gad7: { items: 7, max: 21, bands: [{ from: 0, key: 'minimal' }, { from: 5, key: 'mild' }, { from: 10, key: 'moderate' }, { from: 15, key: 'severe' }] },
};
export const isComplete = (kind: AssessmentKind, answers: (number | null)[]): answers is number[] =>
  answers.length === INSTRUMENTS[kind].items && answers.every(a => Number.isInteger(a) && a! >= 0 && a! <= 3);
export function scoreOf(kind: AssessmentKind, answers: number[]): number {
  if (!isComplete(kind, answers)) throw new Error('incompleteAssessment');
  return answers.reduce((sum, a) => sum + a, 0);
}
export const severityOf = (kind: AssessmentKind, total: number) => [...INSTRUMENTS[kind].bands].reverse().find(band => total >= band.from)!.key;
/** PHQ-9 item 9 asks about thoughts of death or self-harm; any answer above zero needs prompt clinical follow-up. */
export const needsAttention = (kind: AssessmentKind, answers: number[]) => kind === 'phq9' && (answers[8] ?? 0) > 0;
export const history = (list: Assessment[], clientId: string, kind: AssessmentKind) =>
  list.filter(a => a.clientId === clientId && a.kind === kind).sort((a, b) => a.date.localeCompare(b.date) || (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
/** Change against the previous result of the same instrument, or null for the first one. */
export function changeSincePrevious(entries: Assessment[]): number | null {
  if (entries.length < 2) return null;
  const [previous, latest] = entries.slice(-2);
  return scoreOf(latest.kind, latest.answers) - scoreOf(previous.kind, previous.answers);
}
