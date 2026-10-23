import * as crypto from '../lib/crypto';
import type { WorkerTasks } from '../lib/workerTasks';
import { normalizeVault } from '../lib/types';

// Deliberately no DOM, IndexedDB, analytics, logging, credential storage or network sync here.
// Only same-origin font files are fetched, lazily, by the PDF task.
const scope = globalThis as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (value: unknown, transfer?: Transferable[]) => void };
async function execute<K extends keyof WorkerTasks>(task: K, input: WorkerTasks[K]['input']): Promise<WorkerTasks[K]['output']> {
  switch (task) {
    case 'sealSharedDocument': { const { sealSharedDocument } = await import('../lib/documentShareCrypto'); return await sealSharedDocument(input as WorkerTasks['sealSharedDocument']['input']) as WorkerTasks[K]['output']; }
    case 'openSharedDocument': { const { openSharedDocument } = await import('../lib/documentShareCrypto'); return await openSharedDocument(input as WorkerTasks['openSharedDocument']['input']) as WorkerTasks[K]['output']; }
    case 'verifyBackup': { const p = input as WorkerTasks['verifyBackup']['input']; const { verifyBackup } = await import('../lib/verifyBackup'); return await verifyBackup(JSON.parse(p.text), p.passphrase) as WorkerTasks[K]['output']; }
    case 'encryptVault': { const p = input as WorkerTasks['encryptVault']['input']; return await crypto.encryptVault(p.key, p.data, p.vaultId, p.salt, p.base) as WorkerTasks[K]['output']; }
    case 'decryptVault': { const p = input as WorkerTasks['decryptVault']['input']; const data = await crypto.decryptVault(p.key, p.envelope, p.wholeAmounts); const { stateOf } = await import('../lib/crdt'); data.crdt = stateOf(data); return data as WorkerTasks[K]['output']; }
    case 'openVault': {
      const p = input as WorkerTasks['openVault']['input']; const original = await crypto.decryptVault(p.key, p.envelope, false);
      const value = normalizeVault(original); if (value.referrals.length) { const { reconcileReferralStarts } = await import('../lib/referrals'); reconcileReferralStarts(value); } const { stateOf } = await import('../lib/crdt'); value.crdt = stateOf(value);
      return { value, migrated: JSON.stringify(original) !== JSON.stringify(value) } as WorkerTasks[K]['output'];
    }
    case 'encryptBytes': { const p = input as WorkerTasks['encryptBytes']['input']; return await crypto.encryptBytes(p.key, p.bytes, p.context) as WorkerTasks[K]['output']; }
    case 'decryptBytes': { const p = input as WorkerTasks['decryptBytes']['input']; return await crypto.decryptBytes(p.key, p.payload, p.context) as WorkerTasks[K]['output']; }
    case 'taxPdf': { const p = input as WorkerTasks['taxPdf']['input']; const [{taxPdf},{loadPdfFonts}]=await Promise.all([import('../lib/taxPdf'),import('../lib/pdfFonts')]); const {regular,bold}=await loadPdfFonts(''); return await taxPdf(p.report,p.language,regular,bold) as WorkerTasks[K]['output']; }
    case 'invoice': {
      const p = input as WorkerTasks['invoice']['input'];
      const [{ invoicePdf }, { loadPdfFonts }] = await Promise.all([import('../lib/invoicePdf'), import('../lib/pdfFonts')]);
      const { regular, bold } = await loadPdfFonts(JSON.stringify(p.invoice));
      return await invoicePdf(p.invoice, p.paid, regular, bold) as WorkerTasks[K]['output'];
    }
    case 'questionnaire': {
      const p = input as WorkerTasks['questionnaire']['input'];
      const [{ questionnairePdf }, { loadPdfFonts }] = await Promise.all([import('../lib/questionnairePdf'), import('../lib/pdfFonts')]);
      const { regular } = await loadPdfFonts('', false);
      return await questionnairePdf(p.kind, p.language, regular, p.documentId) as WorkerTasks[K]['output'];
    }
    case 'readQuestionnaire': { const p = input as WorkerTasks['readQuestionnaire']['input']; const { readQuestionnaire } = await import('../lib/questionnaireImport'); return await readQuestionnaire(p.bytes, p.kind, p.documentId) as WorkerTasks[K]['output']; }
    case 'merge': { const p = input as WorkerTasks['merge']['input']; const { mergeVaults } = await import('../lib/merge'); return mergeVaults(p.local, p.remote) as WorkerTasks[K]['output']; }
    case 'stringify': return JSON.stringify(input) as WorkerTasks[K]['output'];
    default: throw new Error('workerUnavailable');
  }
}
scope.onmessage = event => {
  const { id, task, input } = event.data;
  void execute(task, input).then(value => {
    scope.postMessage({ id, value }, value instanceof Uint8Array ? [value.buffer] : []);
  }, error => {
    const allowed = ['invalidBackup', 'invoicePdfError', 'questionnaireImportInvalid', 'questionnaireImportIncomplete', 'questionnaireImportMismatch'];
    scope.postMessage({ id, error: error instanceof Error && allowed.includes(error.message) ? error.message : 'workerFailed' });
  });
};
