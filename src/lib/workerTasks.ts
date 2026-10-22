import type { AssessmentKind, Ciphertext, Invoice, Language, VaultData, VaultEnvelope } from './types';
import type { ImportedQuestionnaire } from './questionnaireImport';

export interface WorkerTasks {
  encryptVault: { input: { key: CryptoKey; data: VaultData; vaultId: string; salt: string; base?: Partial<VaultEnvelope> }; output: VaultEnvelope };
  decryptVault: { input: { key: CryptoKey; envelope: VaultEnvelope; wholeAmounts?: boolean }; output: VaultData };
  openVault: { input: { key: CryptoKey; envelope: VaultEnvelope }; output: { value: VaultData; migrated: boolean } };
  encryptBytes: { input: { key: CryptoKey; bytes: Uint8Array<ArrayBuffer>; context: string }; output: Ciphertext };
  decryptBytes: { input: { key: CryptoKey; payload: Ciphertext; context: string }; output: Uint8Array<ArrayBuffer> };
  invoice: { input: { invoice: Invoice; paid: string | null }; output: Uint8Array<ArrayBuffer> };
  questionnaire: { input: { kind: AssessmentKind; language: Language; documentId: string }; output: Uint8Array<ArrayBuffer> };
  readQuestionnaire: { input: { bytes: Uint8Array<ArrayBuffer>; kind: AssessmentKind; documentId: string }; output: ImportedQuestionnaire };
  merge: { input: { local: VaultData; remote: VaultData }; output: VaultData };
  stringify: { input: unknown; output: string };
}
type Task = keyof WorkerTasks;
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void }>();
/** Keys use structured cloning: never exported, persisted or posted to a network endpoint.
 * No main-thread fallback: unsupported/failed workers produce a visible, retryable error. */
export function runSecureTask<K extends Task>(task: K, input: WorkerTasks[K]['input']): Promise<WorkerTasks[K]['output']> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') { reject(new Error('workerUnavailable')); return; }
    try {
      if (!worker) {
        worker = new Worker(new URL('../workers/secure.worker.ts', import.meta.url), { type: 'module', name: 'praxisraum-local' });
        worker.onmessage = (event: MessageEvent<{ id: number; value?: never; error?: string }>) => {
          const job = pending.get(event.data.id); if (!job) return; pending.delete(event.data.id);
          if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.value as never);
        };
        worker.onerror = () => stopSecureWorker('workerUnavailable');
        worker.onmessageerror = () => stopSecureWorker('workerUnavailable');
      }
      const id = ++nextId; pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, task, input }); } catch { pending.delete(id); reject(new Error('workerUnavailable')); }
    } catch { reject(new Error('workerUnavailable')); }
  });
}
export function stopSecureWorker(reason = 'locked') {
  if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); } worker = undefined;
  for (const job of pending.values()) job.reject(new Error(reason)); pending.clear();
}
export const encryptVault = (key: CryptoKey, data: VaultData, vaultId: string, salt: string, base?: Partial<VaultEnvelope>) => runSecureTask('encryptVault', { key, data, vaultId, salt, base });
export const decryptVault = (key: CryptoKey, envelope: VaultEnvelope, wholeAmounts = true) => runSecureTask('decryptVault', { key, envelope, wholeAmounts });
export const encryptBytes = (key: CryptoKey, bytes: Uint8Array<ArrayBuffer>, context: string) => runSecureTask('encryptBytes', { key, bytes, context });
export const decryptBytes = (key: CryptoKey, payload: Ciphertext, context: string) => runSecureTask('decryptBytes', { key, payload, context });
