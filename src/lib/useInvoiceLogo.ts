import { useEffect, useState } from 'react';
import type { InvoiceLogo } from './types';
import type { VaultController } from './useVault';
import { nadiiaInvoiceLogoUrl, type PendingInvoiceLogo } from './invoiceLogo';

/** Custom images exist only as revocable in-memory URLs, including unsaved uploads. */
export function useInvoiceLogo(vault: VaultController, logo?: InvoiceLogo, pending?: PendingInvoiceLogo) {
  const [loaded, setLoaded] = useState<{ key: string | PendingInvoiceLogo; url?: string; error?: boolean }>();
  const id = logo?.enabled && logo.source === 'custom' ? logo.file.blobId : undefined;
  const key = pending ?? id;
  useEffect(() => {
    if (!key) return;
    let active = true, url = '';
    const read = pending ? Promise.resolve(new Blob([pending.bytes], { type: 'image/png' })) : vault.file(id!, 'image/png');
    void read.then(blob => { if (active) { url = URL.createObjectURL(blob); setLoaded({ key, url }); } }, () => { if (active) setLoaded({ key, error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [vault.file, id, key, pending]);
  if (!logo?.enabled) return { url: undefined, loading: false, error: false };
  if (!key) return { url: nadiiaInvoiceLogoUrl(), loading: false, error: false };
  return { url: loaded?.key === key ? loaded.url : undefined, loading: loaded?.key !== key, error: loaded?.key === key && !!loaded.error };
}
