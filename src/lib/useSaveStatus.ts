import { registerEditStatus } from './editStatus';
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface SaveStatus {
  saving: boolean;
  savedAt?: number;
  failed: boolean;
}

/** UI-only feedback. A resolved durable write, rather than optimistic vault
 * state, confirms a save. Edits made during a write remain unsaved. */
export class SaveTracker {
  private state: SaveStatus = { saving: false, failed: false };
  private revision = 0;
  private listeners = new Set<() => void>();

  constructor(private now: () => number = Date.now) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: SaveStatus) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  isDirty = () => this.revision > 0 && this.state.savedAt === undefined;
  changed = () => {
    this.revision++;
    this.publish({ saving: this.state.saving, failed: false });
  };
  save = async (write: () => Promise<unknown>): Promise<boolean> => {
    // Also guard keyboard form submissions and clicks before React renders.
    if (this.state.saving || this.state.savedAt !== undefined) return false;
    const revision = this.revision;
    this.publish({ saving: true, failed: false });
    try {
      await write();
      this.publish({ saving: false, failed: false,
        savedAt: this.revision === revision ? this.now() : undefined });
      return true;
    } catch (error) {
      this.publish({ saving: false, failed: true });
      throw error;
    }
  };
}

export function useSaveStatus() {
  const [tracker] = useState(() => new SaveTracker());
  useEffect(() => { const entry = registerEditStatus(); const update = () => { const state = tracker.getSnapshot(); entry.set(state.failed ? 'error' : state.saving ? 'saving' : tracker.isDirty() ? 'pending' : 'clean'); }; update(); const unsubscribe = tracker.subscribe(update); return () => { unsubscribe(); entry.close(); }; }, [tracker]);
  const state = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  return { ...state, changed: tracker.changed, save: tracker.save };
}
