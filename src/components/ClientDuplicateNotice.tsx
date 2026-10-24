import { useEffect, useMemo, useState } from 'react';
import { clientDuplicateIndex, possibleClientDuplicates, type ClientDuplicateMatch, type DuplicateInput } from '../lib/clientDuplicates';
import { changeClientStatus, clientStatus } from '../lib/clientStatus';
import { useI18n } from '../lib/i18n';
import type { VaultController } from '../lib/useVault';
import { Notice } from './ui';

export function ClientDuplicateNotice({ vault, input, onOpen, matches: reviewedMatches, disabled = false }: { vault: VaultController; input: DuplicateInput; onOpen: (id: string) => void; matches?: readonly ClientDuplicateMatch[]; disabled?: boolean }) {
  const { t } = useI18n();
  const index = useMemo(() => clientDuplicateIndex(vault.data!.clients), [vault.data!.clients]);
  const [query, setQuery] = useState(input), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(input), 300); return () => window.clearTimeout(timer); }, [input.name, input.email, input.contact, input.birthday]);
  const matches = useMemo(() => reviewedMatches ?? possibleClientDuplicates(index, query), [index, query, reviewedMatches]);
  async function reactivate(id: string) {
    if (busy || disabled) return; setBusy(true); setError(false);
    try { await vault.update(d => { const client = d.clients.find(c => c.id === id); if (!client) throw new Error(); changeClientStatus(client, 'active'); }); onOpen(id); }
    catch { setError(true); } finally { setBusy(false); }
  }
  if (!matches.length) return null;
  return <section className="duplicate-notice" aria-label={t('duplicateClientsTitle')}><h3>{t('duplicateClientsTitle')}</h3><p className="hint">{t('duplicateClientsHint')}</p>
    <ul>{matches.map(({ client, reasons }) => <li key={client.id}><div><strong>{client.name}</strong><p className="hint">{t(`clientStatus_${clientStatus(client)}`)} · {reasons.map(reason => t(`duplicateReason_${reason}`)).join(' · ')}</p></div>
      <div className="button-row"><button type="button" className="btn btn-secondary" disabled={busy || disabled} onClick={() => onOpen(client.id)}>{t('duplicateOpen')}</button>{clientStatus(client) !== 'active' && <button type="button" className="btn btn-secondary" disabled={busy || disabled} onClick={() => void reactivate(client.id)}>{t('clientReactivate')}</button>}</div></li>)}</ul>
    {error && <Notice error>{t('storageError')}</Notice>}
  </section>;
}
