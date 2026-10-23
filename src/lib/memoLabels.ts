import { MEMO_MAX_LABEL, validateMemo, type MemoMetadata } from './audioMemos';
import { translate, type TextKey } from './i18n';
import type { Language, VaultData } from './types';

const PRESETS = ['memoLabelReflection', 'memoLabelResources', 'memoLabelGoals', 'memoLabelExercises', 'memoLabelQuestions', 'memoLabelPreparation', 'memoLabelProgress', 'memoLabelObservations'] as const satisfies readonly TextKey[];
export const cleanMemoLabel = (label: string) => label.normalize('NFC').trim().replace(/\s+/g, ' ');
export const memoLabelKey = (label: string) => cleanMemoLabel(label).toLocaleLowerCase('de-DE');
const builtIns = new Set(PRESETS.flatMap(key => (['de', 'uk'] as const).map(language => memoLabelKey(translate(language, key)))));
export interface MemoLabelChoice { id: string; label: string; builtIn: boolean; favorite?: boolean }
/** Static translated choices plus the practice's own encrypted vocabulary. */
export function memoLabelChoices(labels: readonly string[] | undefined, language: Language, favorites: readonly string[] = []): MemoLabelChoice[] {
  const own = new Map<string, string>();
  for (const raw of [...labels ?? []].sort((a, b) => a.localeCompare(b, 'de'))) {
    const label = cleanMemoLabel(raw), key = memoLabelKey(label);
    if (label && label.length <= MEMO_MAX_LABEL && !builtIns.has(key) && !own.has(key)) own.set(key, label);
  }
  return [...PRESETS.map(key => ({ id: key, label: translate(language, key), builtIn: true })), ...[...own].map(([key, label]) => ({ id: `own:${key}`, label, builtIn: false }))].map(choice => ({ ...choice, favorite: favorites.includes(choice.id) })).sort((a, b) => Number(b.favorite) - Number(a.favorite));
}
/** Bound native select options too; typing a partial title finds older custom entries. */
export function visibleMemoLabelChoices(choices: readonly MemoLabelChoice[], input: string, limit = 50): MemoLabelChoice[] {
  const key = memoLabelKey(input), selected = choices.find(choice => memoLabelKey(choice.label) === key);
  const query = selected ? '' : key;
  const own = choices.filter(choice => !choice.builtIn && (!query || memoLabelKey(choice.label).includes(query))).slice(0, limit);
  if (selected && !selected.builtIn && !own.some(choice => choice.id === selected.id)) own.push(selected);
  return [...choices.filter(choice => choice.builtIn), ...own];
}
/** Learn only on an explicit memo/session save, never on typing or discarding a draft. */
export function rememberMemoLabel(data: VaultData, value: string) {
  const label = cleanMemoLabel(value), key = memoLabelKey(label);
  if (!label || builtIns.has(key)) return;
  if (label.length > MEMO_MAX_LABEL) throw new Error('memoTextLimit');
  if ((data.settings.memoLabels ?? []).some(saved => memoLabelKey(saved) === key)) return;
  (data.settings.memoLabels ??= []).push(label);
}
export function editMemoMetadata(data: VaultData, id: string, metadata: MemoMetadata) {
  const memo = data.audioMemos.find(item => item.id === id); if (!memo) throw new Error('storageError');
  validateMemo(memo, metadata);
  if (memo.label !== metadata.label) rememberMemoLabel(data, metadata.label);
  Object.assign(memo, metadata);
}

/** Vocabulary edits never rewrite clinical records. */
export function removeMemoLabel(data: VaultData, value: string) {
  const key = memoLabelKey(value);
  data.settings.memoLabels = (data.settings.memoLabels ?? []).filter(label => memoLabelKey(label) !== key);
  data.settings.memoLabelFavorites = (data.settings.memoLabelFavorites ?? []).filter(id => id !== `own:${key}`);
}
export function renameMemoLabel(data: VaultData, before: string, after: string) {
  const label = cleanMemoLabel(after); if (!label || label.length > MEMO_MAX_LABEL) throw new Error('memoTextLimit');
  const wasFavorite = data.settings.memoLabelFavorites?.includes(`own:${memoLabelKey(before)}`);
  removeMemoLabel(data, before); rememberMemoLabel(data, label);
  const choice = [...memoLabelChoices(data.settings.memoLabels, 'de'), ...memoLabelChoices(data.settings.memoLabels, 'uk')].find(c => memoLabelKey(c.label) === memoLabelKey(label));
  if (wasFavorite && choice) data.settings.memoLabelFavorites = [...new Set([...data.settings.memoLabelFavorites ?? [], choice.id])];
}
