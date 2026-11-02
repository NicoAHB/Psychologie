import type { VaultEnvelope } from './types';

/** Compare encrypted versions, including access changes. No plaintext or new stored identifiers. */
export function sameEnvelope(a: VaultEnvelope | null | undefined, b: VaultEnvelope | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.vaultId === b.vaultId && a.format === b.format && a.salt === b.salt && a.iterations === b.iterations &&
    a.payload.iv === b.payload.iv && a.payload.ciphertext === b.payload.ciphertext && JSON.stringify(a.wraps) === JSON.stringify(b.wraps);
}

/** Hold the primary-vault lock until explicit lock/unmount. CAS in IndexedDB is
 * also mandatory: it protects browsers without Web Locks and older open pages. */
export class VaultWindowAccess {
  private releaseLock?: () => void;
  private acquiring = false;
  async acquire(manager = typeof navigator === 'undefined' ? undefined : navigator.locks): Promise<void> {
    if (this.releaseLock) return;
    if (this.acquiring) throw new Error('vaultInUse');
    if (!manager) return; // Every write still compares the expected encrypted version atomically.
    this.acquiring = true;
    try {
      await new Promise<void>((resolve, reject) => {
        void manager.request('praxisraum:primary-vault', { mode: 'exclusive', ifAvailable: true }, async lock => {
          if (!lock) { reject(new Error('vaultInUse')); return; }
          await new Promise<void>(release => { this.releaseLock = release; resolve(); });
        }).catch(reject);
      });
    } finally { this.acquiring = false; }
  }
  release() { const release = this.releaseLock; this.releaseLock = undefined; release?.(); }
}
