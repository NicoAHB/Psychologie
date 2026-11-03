import { useEditTracker } from './editStatus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerBeforeLock } from './autoLock';
import { saveSessionDraft } from './sessionDrafts';
import type { SessionDraft, SessionDraftValues } from './types';
import type { VaultController } from './useVault';

/** Debounce only small metadata. Completed audio/photo bytes are encrypted once,
 * immediately, and the draft points at their normal encrypted blob IDs. */
export function useSessionDraft(vault: VaultController, draft: Omit<SessionDraft, 'savedAt' | 'payload'>, payload: SessionDraftValues) {
  const tracker = useEditTracker();
  const latest = useRef({ vault, draft, payload }); latest.current = { vault, draft, payload };
  const dirty = useRef(false), revision = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), stopped = useRef(false), observed = useRef({ payload, clientId: draft.clientId });
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'saving' | 'error'>('idle');
  const flush = useCallback(async (patch?: Partial<SessionDraftValues>) => {
    if (stopped.current) return;
    clearTimeout(timer.current);
    if (patch) { latest.current = { ...latest.current, payload: { ...latest.current.payload, ...patch } }; dirty.current = true; revision.current++; tracker.changed(); }
    if (!dirty.current || !latest.current.draft.clientId) return;
    const current = latest.current, version = revision.current;
    const editRevision = tracker.begin(); setStatus('saving');
    try {
      await current.vault.update(data => saveSessionDraft(data, { ...current.draft, payload: current.payload, savedAt: new Date().toISOString() }));
      tracker.finish(editRevision); if (version === revision.current) { dirty.current = false; setStatus('saved'); }
    } catch (error) { tracker.fail(); setStatus('error'); throw error; }
  }, [tracker]);
  useEffect(() => {
    if (observed.current.payload === payload && observed.current.clientId === draft.clientId) return;
    observed.current = { payload, clientId: draft.clientId };
    if (stopped.current) return;
    dirty.current = true; revision.current++; tracker.changed(); setStatus('pending');
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush().catch(() => {}), 700);
  }, [payload, draft.clientId, flush]);
  useEffect(() => {
    const unregister = registerBeforeLock(() => flush());
    const hidden = () => { if (document.visibilityState === 'hidden') void flush().catch(() => {}); };
    const pagehide = () => void flush().catch(() => {});
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pagehide);
    return () => { clearTimeout(timer.current); unregister(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide); };
  }, [flush]);
  return { status, flush, stop() { stopped.current = true; tracker.clear(); clearTimeout(timer.current); }, resume() { stopped.current = false; } };
}
