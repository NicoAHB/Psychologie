import { useEffect, useState } from 'react';

// A new build installs in the background but stays "waiting" until every window is closed. Installed PWAs are rarely
// closed completely, so the app announces the update and lets the user apply it at a convenient moment.
export interface PendingUpdate { apply: () => void }
let pending: PendingUpdate | null = null;
const listeners = new Set<(update: PendingUpdate | null) => void>();
const announce = (update: PendingUpdate | null) => { pending = update; listeners.forEach(listener => listener(update)); };

export function registerServiceWorker(url: string, scope: string) {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register(url, { scope }).then(registration => {
    const ready = (worker: ServiceWorker) => announce({
      apply: () => {
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; window.location.reload(); } });
        worker.postMessage({ type: 'SKIP_WAITING' });
      },
    });
    if (registration.waiting && navigator.serviceWorker.controller) ready(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) ready(worker); });
    });
    const check = () => { void registration.update().catch(() => { /* Offline: try again later. */ }); };
    window.setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => { /* The app also works without the offline cache. */ });
}
export function usePendingUpdate() {
  const [update, setUpdate] = useState<PendingUpdate | null>(pending);
  useEffect(() => { listeners.add(setUpdate); setUpdate(pending); return () => { listeners.delete(setUpdate); }; }, []);
  return update;
}
