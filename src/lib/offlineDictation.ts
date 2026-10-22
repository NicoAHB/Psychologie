let occupied = false;
export function claimDictation(): () => void {
  if (occupied) throw new Error('speechOfflineBusy');
  occupied = true; let released = false; return () => { if (!released) { released = true; occupied = false; } };
}
export function createSpeechWorker(): Worker {
  return new Worker(new URL('../workers/speech.worker.ts', import.meta.url), { type: 'module', name: 'praxisraum-offline-speech' });
}
export function speechJob(worker: Worker, type: 'install' | 'prepare' | 'transcribe', signal: AbortSignal, payload: Record<string, unknown> = {}, progress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const clean = () => { worker.removeEventListener('message', message); worker.removeEventListener('error', error); signal.removeEventListener('abort', aborted); };
    const error = () => { clean(); reject(new Error('speechOfflineError')); };
    const aborted = () => { clean(); reject(new DOMException('Aborted', 'AbortError')); };
    const message = (event: MessageEvent<{ type: string; percent: number; text: string; error: string }>) => {
      if (event.data.type === 'progress') progress?.(event.data.percent);
      if (event.data.type === 'error') { clean(); reject(new Error(event.data.error)); }
      if (['installed', 'ready', 'text'].includes(event.data.type)) { clean(); resolve(event.data.text ?? ''); }
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true }); worker.addEventListener('message', message); worker.addEventListener('error', error);
    worker.postMessage({ type, ...payload });
  });
}
export interface SpeechCapture { finish(): Promise<{ pcm: Float32Array<ArrayBuffer>; rate: number }>; cancel(): void }
/** No MediaRecorder, retained recordings, remote recognizer or audio requests. */
export async function captureSpeech(signal: AbortSignal, limitReached: () => void): Promise<SpeechCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
  if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Aborted', 'AbortError'); }
  let context: AudioContext;
  // Use the device's supported hardware rate (important for Safari); resample in the worker.
  try { context = new AudioContext(); }
  catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  let node: AudioWorkletNode | undefined, source: MediaStreamAudioSourceNode | undefined;
  let chunks: Float32Array[] = [], count = 0, closed = false, finished = false; let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (closed) return; closed = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
    stream.getTracks().forEach(track => track.stop()); source?.disconnect(); node?.disconnect(); if (node) { node.port.onmessage = null; node.port.close(); }
    void context.close().catch(() => {}); for (const chunk of chunks) chunk.fill(0); chunks = []; count = 0;
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await context.resume(); await context.audioWorklet.addModule(new URL(`${import.meta.env.BASE_URL}speech/pcm.worklet.js`, location.origin).href);
    if (closed || signal.aborted) throw new DOMException('Aborted', 'AbortError');
    node = new AudioWorkletNode(context, 'praxisraum-pcm'); source = context.createMediaStreamSource(stream);
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (closed || !(event.data instanceof Float32Array)) return;
      const remaining = context.sampleRate * 20 - count;
      if (remaining > 0) { const part = event.data.slice(0, remaining); chunks.push(part); count += part.length; }
    };
    // A zero-valued output keeps processing active without microphone playback.
    source.connect(node); node.connect(context.destination);
    timer = setTimeout(limitReached, 20000);
    return { cancel, async finish() {
      if (closed || finished) throw new DOMException('Aborted', 'AbortError'); finished = true; clearTimeout(timer);
      source?.disconnect(); stream.getTracks().forEach(track => track.stop());
      // Flush the final partial worklet frame before releasing the audio context.
      await new Promise<void>(resolve => {
        const flushTimer = setTimeout(resolve, 300);
        node!.port.addEventListener('message', function flushed(event: MessageEvent) {
          if (event.data === 'flushed') { node!.port.removeEventListener('message', flushed); clearTimeout(flushTimer); resolve(); }
        });
        node!.port.postMessage('flush');
      });
      if (closed || signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const pcm = new Float32Array(count), rate = context.sampleRate; let offset = 0;
      for (const part of chunks) { pcm.set(part, offset); offset += part.length; part.fill(0); }
      cancel(); return { pcm, rate };
    } };
  } catch (error) { cancel(); throw error; }
}
