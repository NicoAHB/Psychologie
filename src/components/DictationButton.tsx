import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { createLocalRecognition, localSpeechAvailability, localSpeechConstructor, type LocalRecognition, type SpeechAvailability } from '../lib/localSpeech';

/** Local recognition only. No MediaRecorder, audio uploads, remote fallback or stored audio. */
export function DictationButton({ value, onChange, maxLength = 20000 }: { value: string; onChange: (value: string) => void; maxLength?: number }) {
  const { language, t } = useI18n(); const lang = language === 'uk' ? 'uk-UA' : 'de-DE';
  const [availability, setAvailability] = useState<SpeechAvailability>('unavailable');
  const [active, setActive] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<TextKey>();
  const epoch = useRef(0);
  const recognition = useRef<LocalRecognition | undefined>(undefined); const live = useRef({ value, onChange }); live.current = { value, onChange };
  useEffect(() => {
    const generation = ++epoch.current; let mounted = true; const ctor = localSpeechConstructor(); setAvailability('unavailable'); setActive(false); setBusy(false); setMessage(undefined);
    if (ctor) void localSpeechAvailability(ctor, lang).then(status => { if (mounted) setAvailability(status); });
    const hidden = () => { if (document.visibilityState === 'hidden') recognition.current?.stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { if (epoch.current === generation) epoch.current++; mounted = false; document.removeEventListener('visibilitychange', hidden); const r = recognition.current; if (r) { r.onend = null; r.onresult = null; r.onerror = null; r.abort(); } recognition.current = undefined; };
  }, [lang]);
  async function start() {
    if (active) { recognition.current?.stop(); return; }
    const ctor = localSpeechConstructor(); if (!ctor) return;
    const generation = epoch.current; setBusy(true); setMessage(undefined);
    try {
      const status = await localSpeechAvailability(ctor, lang); if (generation !== epoch.current || document.visibilityState === 'hidden') return; setAvailability(status);
      if (status !== 'available') return;
      const r = createLocalRecognition(ctor, lang); recognition.current = r;
      const base = live.current.value; let previous = base;
      r.onresult = event => {
        if (live.current.value !== previous && live.current.value !== base) { r.abort(); setMessage('speechEdited'); return; }
        const text = Array.from(event.results, result => result[0].transcript).join(' ').trim();
        const next = `${base}${base && text && !/\s$/.test(base) ? ' ' : ''}${text}`.slice(0, maxLength);
        previous = next; live.current.onChange(next);
        if (next.length >= maxLength) r.stop();
      };
      r.onerror = () => { setMessage('speechError'); setActive(false); r.onerror = null; r.abort(); };
      r.onend = () => { setActive(false); recognition.current = undefined; };
      r.start(); setActive(true);
    } catch { recognition.current?.abort(); recognition.current = undefined; if (generation === epoch.current) setMessage('speechError'); } finally { if (generation === epoch.current) setBusy(false); }
  }
  async function install() {
    const ctor = localSpeechConstructor(); if (!ctor?.install) return;
    setBusy(true); setMessage(undefined);
    try { await ctor.install({ langs: [lang], processLocally: true }); setAvailability(await localSpeechAvailability(ctor, lang)); }
    catch { setMessage('speechError'); } finally { setBusy(false); }
  }
  return <div className="dictation-tools"><button className="btn btn-secondary btn-small" type="button" aria-pressed={active} disabled={busy || availability !== 'available'} onClick={() => void start()}>{active ? <Square size={15}/> : <Mic size={15}/>} {t(active ? 'speechStop' : 'speechStart')}</button>
    {availability === 'downloadable' && <button className="btn btn-secondary btn-small" type="button" disabled={busy} onClick={() => void install()}>{t('speechInstall')}</button>}
    <small role="status">{t(message ?? (active ? 'speechListening' : availability === 'available' ? 'speechLocal' : 'speechUnavailable'))}</small></div>;
}
