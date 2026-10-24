import type { TextKey } from './i18n';

export const FOLLOW_UP_NOTE_MAX = 500;
export const FOLLOW_UP_REASONS = [
  'followUpReasonPause', 'followUpReasonReply', 'followUpReasonAppointment',
  'followUpReasonExercise', 'followUpReasonDocuments', 'followUpReasonNeeds',
  'followUpReasonAfterCompletion',
] as const satisfies readonly TextKey[];

const key = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk');

/** Explicitly selected text only. Custom notes are retained, duplicate reasons
 * (in either UI language) are skipped, and no text is silently truncated. */
export function applyFollowUpReason(note: string, label: string, presets: readonly string[], aliases: readonly string[] = [label]): string {
  const selected = label.trim();
  if (!selected) return note;
  const lines = note.split(/\r?\n/).map(key);
  if (aliases.some(alias => lines.includes(key(alias)))) return note;
  const next = !note.trim() || presets.some(preset => key(preset) === key(note))
    ? selected : `${note.trimEnd()}\n${selected}`;
  if (next.length > FOLLOW_UP_NOTE_MAX) throw new Error('followUpReasonTooLong');
  return next;
}
