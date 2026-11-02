import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { HardDrive } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { readStorageHealth, storagePressure, type StorageHealth } from '../lib/storageHealth';
import { Notice } from './ui';

const StorageContext = createContext<{ health: StorageHealth; incoming: number; refresh: () => Promise<void> }>({ health: {}, incoming: 0, refresh: async () => {} });
export function StorageHealthProvider({ generation, children }: { generation: number; children: ReactNode }) {
  const [health, setHealth] = useState<StorageHealth>({}), [incoming, setIncoming] = useState(0);
  const live = useRef(false), busy = useRef(false), last = useRef(0);
  const refresh = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try { const next = await readStorageHealth(); if (live.current) { setHealth(next); setIncoming(0); last.current = Date.now(); } }
    finally { busy.current = false; }
  }, []);
  useEffect(() => {
    live.current = true; void refresh();
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(); };
    const incomingWrite = (event: Event) => { const bytes = (event as CustomEvent<number>).detail; if (Number.isFinite(bytes) && bytes > 0) setIncoming(bytes); };
    const timer = window.setInterval(foreground, 30000);
    document.addEventListener('visibilitychange', foreground); window.addEventListener('praxisraum-storage-write', incomingWrite);
    return () => { live.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('praxisraum-storage-write', incomingWrite); };
  }, [refresh]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), Math.max(1000, 5000 - (Date.now() - last.current))); return () => clearTimeout(timer); }, [generation, refresh]);
  return <StorageContext.Provider value={{ health, incoming, refresh }}>{children}</StorageContext.Provider>;
}
export function StorageWarning({ onBackup }: { onBackup: () => void }) {
  const { t } = useI18n(), { health, incoming } = useContext(StorageContext), pressure = storagePressure(health, incoming);
  if (pressure !== 'low' && pressure !== 'critical') return null;
  return <Notice error><span>{t(pressure === 'critical' ? 'storageCritical' : 'storageLow')}</span><button type="button" className="text-link" onClick={onBackup}>{t('storageOpenBackup')}</button></Notice>;
}
export function StorageHealthCard() {
  const { t, language } = useI18n(), { health, refresh } = useContext(StorageContext);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<'storageGranted' | 'storageDenied'>();
  const valid = health.usage !== undefined && health.quota !== undefined;
  const size = (bytes: number) => new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'uk-UA', { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1048576);
  return <section className="card settings-card storage-health" aria-label={t('storageHealthTitle')}><span className="settings-icon"><HardDrive size={24}/></span><h2>{t('storageHealthTitle')}</h2><p>{t('storageEstimateHint')}</p>
    {valid ? <><p>{t('storageUsage').replace('{used}', size(health.usage!)).replace('{total}', size(health.quota!))}</p><meter aria-label={t('storageUsageMeter')} min={0} max={health.quota} value={Math.min(health.usage!, health.quota!)} low={health.quota! * .8} high={health.quota! * .95} optimum={0}/></> : <p>{t('storageEstimateUnavailable')}</p>}
    <p className="hint">{t(health.persisted === true ? 'storageIsPersistent' : health.persisted === false ? 'storageNotPersistent' : 'storagePersistenceUnknown')}</p>
    <p>{t('installHint')}</p><p className="hint">{t('storageHint')}</p><div className="button-row"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>{t('storageRefresh')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => { setBusy(true); try { setMessage(await navigator.storage?.persist?.() ? 'storageGranted' : 'storageDenied'); await refresh(); } catch { setMessage('storageDenied'); } finally { setBusy(false); } }}>{t('storagePersist')}</button></div>{message && <Notice>{t(message)}</Notice>}
  </section>;
}
