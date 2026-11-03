import { useEffect, useState, useSyncExternalStore } from 'react';

export type EditPhase = 'clean' | 'pending' | 'saving' | 'error';
export interface EditState { phase: EditPhase; savedAt?: number }
/** UI metadata only: no text, client ID, or key is kept in this registry. */
const entries = new Map<symbol, EditPhase>();
const listeners = new Set<() => void>();
let aggregate: EditPhase = 'clean';
function publish() {
  const phases = [...entries.values()];
  const next = phases.includes('error') ? 'error' : phases.includes('pending') ? 'pending' : phases.includes('saving') ? 'saving' : 'clean';
  if (next !== aggregate) { aggregate = next; for (const listener of listeners) listener(); }
}
export function registerEditStatus() {
  const id = Symbol();
  return { set(phase: EditPhase) { entries.set(id, phase); publish(); }, close() { entries.delete(id); publish(); } };
}
export const hasUnsavedEdits = () => aggregate !== 'clean';
export function usePendingEdits() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => aggregate); }

export class EditTracker {
  private revision = 0;
  private state: EditState = { phase: 'clean' };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: EditState) { this.state = state; for (const listener of this.listeners) listener(); }
  changed = () => { this.revision++; this.publish({ phase: 'pending' }); };
  begin = () => { this.publish({ phase: 'saving' }); return this.revision; };
  finish = (revision: number, at = Date.now()) => { if(this.state.phase === 'clean' && this.state.savedAt === undefined) return; this.publish(revision === this.revision ? { phase: 'clean', savedAt: at } : { phase: 'pending' }); };
  fail = () => { if(this.state.phase === 'clean') return; this.publish({ phase: 'error' }); };
  clear = () => { this.revision++; this.publish({ phase: 'clean' }); };
}
export function useEditTracker() {
  const [tracker] = useState(() => new EditTracker());
  useEffect(() => { const entry = registerEditStatus(); const update = () => entry.set(tracker.getSnapshot().phase); update(); const unsubscribe = tracker.subscribe(update); return () => { unsubscribe(); entry.close(); }; }, [tracker]);
  return tracker;
}
