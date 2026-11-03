import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { registerBeforeLock } from '../lib/autoLock';
import { useEditTracker } from '../lib/editStatus';
import { useI18n } from '../lib/i18n';
import type { VaultController } from '../lib/useVault';

/** The shared private notes editor flushes before locking and only confirms a
 * resolved encrypted write. A later edit cannot inherit an earlier save time. */
export function VaultTextEditor({ vault, clientId, sessionId, stored, label, placeholder, rows = 5 }: { vault: VaultController; clientId: string; sessionId?: string; stored: string; label: string; placeholder?: string; rows?: number }) {
  const { t, language } = useI18n(); const [value, setValue] = useState(stored);
  const pending = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(vault); latest.current = vault;
  const tracker = useEditTracker(), status = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  const running = useRef<Promise<void> | undefined>(undefined);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (running.current) await running.current;
    while (pending.current !== null) {
      const text = pending.current; pending.current = null; const revision = tracker.begin();
      const task = latest.current.update(data => {
        if (sessionId) { const session = data.sessions.find(s => s.id === sessionId && s.clientId === clientId); if (!session) throw new Error('storageError'); session.notes = text; }
        else { const client = data.clients.find(c => c.id === clientId); if (!client) throw new Error('storageError'); client.preparation = text; }
      });
      running.current = task;
      try { await task; tracker.finish(revision); }
      catch (error) { if (pending.current === null) pending.current = text; tracker.fail(); throw error; }
      finally { if (running.current === task) running.current = undefined; }
    }
  }, [clientId, sessionId, tracker]);
  useEffect(() => { if (pending.current === null && !running.current) setValue(stored); }, [stored]);
  useEffect(() => {
    const unregister = registerBeforeLock(flush);
    const hidden = () => { if (document.visibilityState === 'hidden') void flush().catch(() => {}); };
    const hide = () => { void flush().catch(() => {}); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', hide);
    return () => { void flush().catch(() => {}); unregister(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', hide); };
  }, [flush]);
  const message = status.phase === 'pending' ? t('savePending') : status.phase === 'saving' ? t('savingEncrypted') : status.phase === 'error' ? t('storageError') : status.savedAt ? t('savedAtTime').replace('{time}', new Date(status.savedAt).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })) : t('saved');
  return <><textarea lang={language} rows={rows} aria-label={label} placeholder={placeholder} maxLength={sessionId ? 20000 : 30000} value={value} onBlur={() => void flush().catch(() => {})} onChange={event => { const text = event.target.value; setValue(text); pending.current = text; tracker.changed(); clearTimeout(timer.current); timer.current = setTimeout(() => void flush().catch(() => {}), 700); }}/><p className="autosave" role="status">{message}{status.phase === 'error' && <button type="button" className="text-link" onClick={() => void flush().catch(() => {})}>{t('retry')}</button>}</p></>;
}
