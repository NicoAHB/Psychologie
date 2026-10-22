import { audioMime, MEMO_MAX_BYTES, MEMO_MAX_DURATION_MS, validateMemo, type MemoRecording } from './audioMemos';

export type MemoRecorderError = 'memoUnsupported' | 'memoMicrophoneDenied' | 'memoMicrophoneMissing' | 'memoRecordingError' | 'memoSizeLimit' | 'memoDurationLimit' | 'memoInvalidRecording';
export interface MemoRecorderEvents {
  status: (phase: 'requesting' | 'recording' | 'stopping') => void;
  tick: (durationMs: number, bytes: number) => void;
  recorded: (value: MemoRecording) => void;
  error: (error: MemoRecorderError) => void;
  limit: (error: 'memoDurationLimit') => void;
}
interface RecorderPlatform { devices: Pick<MediaDevices, 'getUserMedia'>; Recorder: typeof MediaRecorder; now: () => number }
export function memoRecordingSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}
export function memoMimeType(Recorder: typeof MediaRecorder): string | undefined {
  if (typeof Recorder.isTypeSupported !== 'function') return undefined;
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'].find(t => Recorder.isTypeSupported(t));
  if (!type) throw new Error('memoUnsupported');
  return type;
}
/** Audio capture only: no file system, storage, network, models or speech APIs. */
export class MemoRecorder {
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private bytes = 0;
  private started = 0;
  private duration = 0;
  private disposed = false;
  private stopping = false;
  private fatal = false;
  private timer?: ReturnType<typeof setInterval>;
  private createdAt = '';
  private pending = false;
  constructor(private events: MemoRecorderEvents, private platform?: RecorderPlatform) {}
  async start(): Promise<void> {
    if (this.disposed || this.pending || this.recorder || this.stream) return; this.pending = true;
    this.events.status('requesting');
    try {
      if (!this.platform) {
        if (!memoRecordingSupported()) throw new Error('memoUnsupported');
        this.platform = { devices: navigator.mediaDevices, Recorder: MediaRecorder, now: () => performance.now() };
      }
      const mimeType = memoMimeType(this.platform.Recorder);
      const stream = await this.platform.devices.getUserMedia({ audio: true, video: false });
      if (this.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const recorder = this.recorder = new this.platform.Recorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 64000 });
      this.createdAt = new Date().toISOString(); this.started = this.platform.now();
      recorder.ondataavailable = event => {
        if (this.disposed || this.fatal || !event.data.size) return;
        if (this.bytes + event.data.size > MEMO_MAX_BYTES) { this.fatal = true; this.chunks = []; this.events.error('memoSizeLimit'); this.stop(); return; }
        this.chunks.push(event.data); this.bytes += event.data.size;
      };
      recorder.onerror = () => { if (!this.disposed) { this.events.error('memoRecordingError'); this.dispose(); } };
      recorder.onstop = () => {
        if (this.disposed) return;
        const mime = audioMime(recorder.mimeType || this.chunks[0]?.type || mimeType || '');
        const blob = new Blob(this.chunks, { type: mime ?? '' });
        const durationMs = this.duration || Math.min(MEMO_MAX_DURATION_MS, Math.max(1, this.elapsed()));
        this.release(); this.chunks = [];
        if (this.fatal) return;
        try { validateMemo({ size: blob.size, durationMs, mimeType: mime ?? '' }); }
        catch (error) { this.events.error(error instanceof Error ? error.message as MemoRecorderError : 'memoInvalidRecording'); return; }
        this.events.recorded({ blob, mimeType: mime!, size: blob.size, durationMs, createdAt: this.createdAt });
      };
      recorder.start(1000);
      if (this.disposed || this.stopping) return;
      this.events.status('recording'); this.events.tick(0, 0);
      this.timer = setInterval(() => {
        if (this.disposed || this.stopping) return;
        const elapsed = this.elapsed(); this.events.tick(Math.min(elapsed, MEMO_MAX_DURATION_MS), this.bytes);
        if (elapsed >= MEMO_MAX_DURATION_MS) { this.events.limit('memoDurationLimit'); this.stop(); }
      }, 250);
    } catch (error) {
      if (this.disposed) return;
      const name = error instanceof Error ? error.name : '';
      this.events.error(error instanceof Error && error.message === 'memoUnsupported' ? 'memoUnsupported'
        : ['NotAllowedError', 'SecurityError'].includes(name) ? 'memoMicrophoneDenied'
          : ['NotFoundError', 'NotReadableError', 'AbortError'].includes(name) ? 'memoMicrophoneMissing' : 'memoRecordingError');
      this.dispose();
    }
  }
  private elapsed() { return Math.max(0, (this.platform?.now() ?? this.started) - this.started); }
  stop(): void {
    if (this.disposed || this.stopping || !this.recorder) return;
    this.stopping = true; this.duration = Math.min(MEMO_MAX_DURATION_MS, Math.max(1, this.elapsed())); clearInterval(this.timer);
    if (!this.fatal) this.events.status('stopping');
    try { if (this.recorder.state !== 'inactive') this.recorder.stop(); }
    catch { this.events.error('memoRecordingError'); this.dispose(); }
  }
  private release() {
    clearInterval(this.timer); this.timer = undefined;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
    if (this.recorder) { this.recorder.ondataavailable = null; this.recorder.onerror = null; this.recorder.onstop = null; }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    const recorder = this.recorder; this.release(); this.chunks = [];
    if (recorder?.state !== 'inactive') { try { recorder?.stop(); } catch { /* Tracks already stopped. */ } }
    this.recorder = undefined;
  }
}
