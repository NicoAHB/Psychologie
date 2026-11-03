import { useEditTracker } from './editStatus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerBeforeLock } from './autoLock';
import { saveNewsletterDraft } from './newsletterDrafts';
import type { NewsletterDraftPayload } from './types';
import type { VaultController } from './useVault';

/** Only encrypted metadata is debounced. Image bytes use the ordinary encrypted file store. */
export function useNewsletterDraft(vault: VaultController, id: string, payload: NewsletterDraftPayload) {
  const tracker = useEditTracker();
  const latest = useRef({ vault, id, payload }); latest.current = { vault, id, payload };
  const observed = useRef({ id, payload }), dirty = useRef(false), revision = useRef(0), stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), running = useRef<Promise<void> | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const flush = useCallback(async (patch?: Partial<NewsletterDraftPayload>) => {
    clearTimeout(timer.current);
    if (stopped.current) return;
    if (patch) { latest.current = { ...latest.current, payload: { ...latest.current.payload, ...patch } }; dirty.current = true; revision.current++; tracker.changed(); }
    if (running.current) await running.current;
    while (dirty.current && !stopped.current) {
      if (running.current) { await running.current; continue; }
      const current = latest.current, version = revision.current;
      const editRevision = tracker.begin(); setStatus('saving');
      const task = current.vault.update(data => {
        const existing = data.newsletterDrafts.find(d => d.id === current.id), now = new Date().toISOString();
        saveNewsletterDraft(data, { id: current.id, createdAt: existing?.createdAt ?? now, savedAt: now, payload: current.payload });
      });
      running.current = task;
      try { await task; tracker.finish(editRevision); if (version === revision.current) { dirty.current = false; setStatus('saved'); } }
      catch (error) { tracker.fail(); setStatus('error'); throw error; }
      finally { if (running.current === task) running.current = undefined; }
    }
  }, [tracker]);
  useEffect(() => {
    if (observed.current.id !== id) { observed.current = { id, payload }; dirty.current = false; stopped.current = false; tracker.clear(); setStatus('idle'); return; }
    if (observed.current.payload === payload || stopped.current) return;
    observed.current = { id, payload }; dirty.current = true; revision.current++; tracker.changed(); setStatus('pending');
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush().catch(() => {}), 700);
  }, [id, payload, flush]);
  useEffect(() => {
    const unregister = registerBeforeLock(() => flush());
    const hidden = () => { if (document.visibilityState === 'hidden') void flush().catch(() => {}); };
    const pagehide = () => void flush().catch(() => {});
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pagehide);
    return () => { clearTimeout(timer.current); void flush().catch(() => {}); unregister(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide); };
  }, [flush]);
  return { status, flush, async stop() { clearTimeout(timer.current); stopped.current = true; await running.current; tracker.clear(); }, resume() { stopped.current = false; } };
}
