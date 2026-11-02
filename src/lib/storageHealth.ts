export interface StorageHealth { usage?: number; quota?: number; persisted?: boolean }
export function storagePressure(health: StorageHealth, incoming = 0): 'unknown' | 'ok' | 'low' | 'critical' {
  const { usage, quota } = health;
  if (usage === undefined || quota === undefined || !Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0 || usage < 0) return 'unknown';
  const projected = usage + Math.max(0, Number.isFinite(incoming) ? incoming : 0), free = quota - projected;
  if (projected / quota >= .95 || free <= 10 * 1024 * 1024) return 'critical';
  if (projected / quota >= .8 || free <= 50 * 1024 * 1024) return 'low';
  return 'ok';
}
export async function readStorageHealth(storage: Pick<StorageManager, 'estimate' | 'persisted'> | undefined = navigator.storage): Promise<StorageHealth> {
  const result: StorageHealth = {};
  if (!storage) return result;
  if (typeof storage.estimate === 'function') try {
    const estimate = await storage.estimate();
    if (Number.isFinite(estimate.usage) && Number.isFinite(estimate.quota) && estimate.usage! >= 0 && estimate.quota! > 0) { result.usage = estimate.usage; result.quota = estimate.quota; }
  } catch { /* Safari and private profiles may not expose an estimate. */ }
  if (typeof storage.persisted === 'function') try { result.persisted = await storage.persisted(); } catch { /* Unknown rather than a false guarantee. */ }
  return result;
}
export function announceStorageWrite(bytes: number) {
  if (typeof window !== 'undefined' && bytes >= 1024 * 1024) window.dispatchEvent(new CustomEvent('praxisraum-storage-write', { detail: bytes }));
}
