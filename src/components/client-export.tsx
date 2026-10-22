import { useState } from 'react';
import { Download } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { downloadDocument } from '../lib/documents';
import type { Client } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Modal, Notice } from './ui';

export function ClientExportButton({ vault, client }: { vault: VaultController; client: Client }) {
  const { t, language } = useI18n(); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  async function run() {
    setBusy(true); setError(false);
    try {
      await vault.flush(); const snapshot = structuredClone(vault.data!);
      const { clientExport } = await import('../lib/clientExport'); const result = await clientExport(snapshot, client.id, language, vault.file);
      downloadDocument(new Blob([result.bytes], { type: 'application/zip' }), result.filename); setOpen(false);
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <><button className="btn btn-secondary btn-small" onClick={() => setOpen(true)}><Download size={16}/>{t('clientExportButton')}</button>{open && <Modal title={t('clientExportTitle')} onClose={() => { if (!busy) setOpen(false); }}><p><strong>{client.name}</strong></p><p>{t('clientExportContents')}</p><Notice>{t('clientExportPrivacy')}</Notice>{error && <Notice error>{t('clientExportError')}</Notice>}<div className="form-actions"><button className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy} onClick={() => void run()}>{t(busy ? 'working' : 'clientExportDownload')}</button></div></Modal>}</>;
}
