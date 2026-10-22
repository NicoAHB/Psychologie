import { useEffect, useRef, useState } from 'react';
import { Download, Mic, Square, X } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { hasSpeechPack, removeSpeechPack, speechPackStoredBytes, SPEECH_PACK_BYTES } from '../lib/speechPack';
import { captureSpeech, claimDictation, createSpeechWorker, speechJob, type SpeechCapture } from '../lib/offlineDictation';

/** Explicit opt-in alternative when the browser has no native local DE/UA pack. */
export function OfflineDictation({ value, onChange, maxLength }: { value: string; onChange: (value: string) => void; maxLength: number }) {
  const { language, t } = useI18n(); const [installed, setInstalled] = useState(false);
  const [stored, setStored] = useState(false);
  const [stage, setStage] = useState<'idle' | 'install' | 'prepare' | 'listen' | 'transcribe'>('idle');
  const [percent, setPercent] = useState(0), [message, setMessage] = useState<TextKey>();
  const current = useRef({ value, onChange }); current.current = { value, onChange };
  const task = useRef<{ controller: AbortController; worker: Worker; release: () => void; capture?: SpeechCapture } | undefined>(undefined);
  const supported = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined' && 'caches' in window;
  const stop = () => { const run = task.current; task.current = undefined; run?.controller.abort(); run?.capture?.cancel(); run?.worker.terminate(); run?.release(); };
  useEffect(() => {
    let disposed = false;
    const refresh = () => { void speechPackStoredBytes().then(bytes => { if (!disposed) { setInstalled(bytes === SPEECH_PACK_BYTES); setStored(bytes > 0); } }).catch(() => {}); };
    refresh(); setStage('idle'); setMessage(undefined);
    const hide = () => { if (document.visibilityState === 'hidden') { stop(); setStage('idle'); } };
    window.addEventListener('praxisraum-speech-pack', refresh); document.addEventListener('visibilitychange', hide);
    return () => { disposed = true; stop(); window.removeEventListener('praxisraum-speech-pack', refresh); document.removeEventListener('visibilitychange', hide); };
  }, [language]);
  const report = (error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof Error && error.message === 'speechOfflineMissing') setInstalled(false);
    const known: TextKey[] = ['speechOfflineBusy', 'speechOfflineMissing', 'speechOfflineLong', 'speechOfflineSpace'];
    setMessage(error instanceof Error && known.includes(error.message as TextKey) ? error.message as TextKey : 'speechOfflineError');
  };
  async function install() {
    let run: NonNullable<typeof task.current> | undefined;
    try {
      const release = claimDictation();
      try { run = { controller: new AbortController(), worker: createSpeechWorker(), release }; } catch (error) { release(); throw error; }
      task.current = run; setMessage(undefined); setPercent(0); setStored(true); setStage('install');
      await speechJob(run.worker, 'install', run.controller.signal, {}, setPercent);
      if (task.current !== run) return;
      setInstalled(true); window.dispatchEvent(new Event('praxisraum-speech-pack'));
      void navigator.storage?.persist?.().catch(() => {});
    } catch (error) { if (!run || task.current === run) report(error); }
    finally { if (run && task.current === run) { stop(); setStage('idle'); } }
  }
  async function finish() {
    const run = task.current; if (!run?.capture) return;
    const capture = run.capture; run.capture = undefined; const base = current.current.value;
    setStage('transcribe'); let pcm: Float32Array | undefined;
    try {
      const recording = await capture.finish(); pcm = recording.pcm;
      const text = await speechJob(run.worker, 'transcribe', run.controller.signal, { ...recording, language });
      if (task.current !== run) return;
      if (current.current.value !== base) { setMessage('speechEdited'); return; }
      if (!text) { setMessage('speechOfflineSilence'); return; }
      const next = `${base}${base && !/\s$/.test(base) ? ' ' : ''}${text}`;
      if (next.length > maxLength) { setMessage('speechOfflineLong'); return; }
      current.current.onChange(next); setMessage('speechLocal');
    } catch (error) { if (task.current === run) report(error); }
    finally { pcm?.fill(0); if (task.current === run) { stop(); setStage('idle'); } }
  }
  async function start() {
    let run: NonNullable<typeof task.current> | undefined;
    try {
      const release = claimDictation();
      try { run = { controller: new AbortController(), worker: createSpeechWorker(), release }; } catch (error) { release(); throw error; }
      task.current = run; setMessage(undefined); setStage('prepare');
      if (!navigator.serviceWorker?.controller) throw new Error('speechOfflineMissing');
      if (!await hasSpeechPack()) { setInstalled(false); throw new Error('speechOfflineMissing'); }
      await speechJob(run.worker, 'prepare', run.controller.signal);
      if (task.current !== run) return;
      run.capture = await captureSpeech(run.controller.signal, () => void finish());
      if (task.current === run) setStage('listen');
    } catch (error) { if (!run || task.current === run) report(error); if (run && task.current === run) { stop(); setStage('idle'); } }
  }
  async function remove() {
    try { await removeSpeechPack(); setInstalled(false); setStored(false); setMessage(undefined); window.dispatchEvent(new Event('praxisraum-speech-pack')); } catch (error) { report(error); }
  }
  if (!supported) return null;
  return <div className="dictation-offline">
    <div className="dictation-tools">
      {!installed && stage !== 'install' && <button type="button" className="btn btn-secondary btn-small" disabled={stage !== 'idle'} onClick={() => void install()}><Download size={15}/> {t('speechOfflineInstall').replace('{size}', String(Math.ceil(SPEECH_PACK_BYTES / 1e6)))}</button>}
      {installed && <button type="button" className="btn btn-secondary btn-small" aria-pressed={stage === 'listen'} disabled={!['idle', 'listen'].includes(stage)} onClick={() => void (stage === 'listen' ? finish() : start())}>{stage === 'listen' ? <Square size={15}/> : <Mic size={15}/>} {t(stage === 'listen' ? 'speechOfflineFinish' : 'speechOfflineStart')}</button>}
      {stage !== 'idle' && <button type="button" className="btn btn-secondary btn-small" onClick={() => { stop(); setStage('idle'); }}><X size={15}/> {t('cancel')}</button>}
      {stored && stage === 'idle' && <button type="button" className="btn btn-secondary btn-small" onClick={() => void remove()}>{t('speechOfflineRemove')}</button>}
    </div>
    <small role="status">{stage === 'install' ? t('speechOfflineProgress').replace('{percent}', String(percent)) : t(message ?? (stage === 'prepare' ? 'speechOfflinePreparing' : stage === 'listen' ? 'speechOfflineListening' : stage === 'transcribe' ? 'speechOfflineTranscribing' : installed ? 'speechOfflineReady' : 'speechOfflineHint'))}</small>
  </div>;
}
