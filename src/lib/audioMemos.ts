import type { AudioMemo } from './types';

export const MEMO_MAX_BYTES = 25 * 1024 * 1024;
export const MEMO_MAX_DURATION_MS = 20 * 60 * 1000;
export const MEMO_MAX_SUMMARY = 2000;
export const MEMO_MAX_LABEL = 120;
export interface MemoRecording { blob: Blob; mimeType: string; size: number; durationMs: number; createdAt: string }
export type MemoDraft = MemoRecording & Pick<AudioMemo, 'id' | 'label' | 'summary'>;
export type MemoItem = AudioMemo | MemoDraft;
export type MemoMetadata = Pick<AudioMemo, 'label' | 'summary'>;
export function audioMime(type: string): string | undefined {
  const base = type.split(';')[0].trim().toLowerCase();
  return ['audio/mp4', 'audio/webm', 'audio/ogg'].includes(base) ? base : undefined;
}
export const audioExtension = (type: string) => audioMime(type) === 'audio/mp4' ? 'm4a' : audioMime(type) === 'audio/ogg' ? 'ogg' : 'webm';
export function validateMemo(recording: Pick<AudioMemo, 'size' | 'durationMs' | 'mimeType'>, metadata?: MemoMetadata) {
  if (!Number.isSafeInteger(recording.size) || recording.size < 1 || !Number.isFinite(recording.durationMs) || recording.durationMs <= 0) throw new Error('memoInvalidRecording');
  if (recording.size > MEMO_MAX_BYTES) throw new Error('memoSizeLimit');
  if (recording.durationMs > MEMO_MAX_DURATION_MS) throw new Error('memoDurationLimit');
  if (!audioMime(recording.mimeType)) throw new Error('memoUnsupported');
  if (metadata && (metadata.label.length > MEMO_MAX_LABEL || metadata.summary.length > MEMO_MAX_SUMMARY)) throw new Error('memoTextLimit');
}
/** A numeric media timer is identical in both UI languages; its accessible label is translated by the caller. */
export function memoTime(ms: number): string {
  const seconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
