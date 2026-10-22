export type SpeechAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
export interface LocalSpeechResultEvent { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
export interface LocalRecognition {
  processLocally: boolean; lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: LocalSpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export interface LocalSpeechConstructor {
  new(): LocalRecognition;
  available(options: { langs: string[]; processLocally: true }): Promise<SpeechAvailability>;
  install?(options: { langs: string[]; processLocally: true }): Promise<boolean>;
}
export function localSpeechConstructor(): LocalSpeechConstructor | undefined {
  if (typeof window === 'undefined' || !window.isSecureContext) return;
  const w = window as unknown as { SpeechRecognition?: LocalSpeechConstructor; webkitSpeechRecognition?: LocalSpeechConstructor };
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!ctor || typeof ctor.available !== 'function') return;
  try {
  const recognition = new ctor();
  // Older Web Speech implementations silently send audio to a provider. Never use those.
  if (!('processLocally' in recognition)) return;
  recognition.processLocally = true;
  if (recognition.processLocally !== true) return;
  return ctor;
  } catch { return; }
}
export async function localSpeechAvailability(ctor: LocalSpeechConstructor, lang: string): Promise<SpeechAvailability> {
  try { return await ctor.available({ langs: [lang], processLocally: true }); } catch { return 'unavailable'; }
}
export function createLocalRecognition(ctor: LocalSpeechConstructor, lang: string): LocalRecognition {
  const recognition = new ctor();
  if (!('processLocally' in recognition)) throw new Error('speechUnavailable');
  recognition.processLocally = true;
  if (recognition.processLocally !== true) throw new Error('speechUnavailable');
  recognition.lang = lang; recognition.continuous = true; recognition.interimResults = true;
  return recognition;
}
