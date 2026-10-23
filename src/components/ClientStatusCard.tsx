import { useState } from 'react';
import { changeClientStatus, clientStatus } from '../lib/clientStatus';
import { useI18n } from '../lib/i18n';
import type { Client } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Notice } from './ui';

export function ClientStatusCard({ vault, client }: { vault: VaultController; client: Client }) {
  const { t, language } = useI18n(); const [busy, setBusy] = useState(false), [error, setError] = useState(false), [limit, setLimit] = useState(5);
  const status = clientStatus(client), history = [...client.statusHistory ?? []].sort((a, b) => b.at.localeCompare(a.at));
  async function reactivate() { setBusy(true); setError(false); try { await vault.update(data => { const owner = data.clients.find(c => c.id === client.id); if (!owner) throw new Error(); changeClientStatus(owner, 'active'); }); } catch { setError(true); } finally { setBusy(false); } }
  return <section className="card client-status-card" aria-label={t('clientStatus')}><div className="section-heading flex-wrap"><h2>{t('clientStatus')}: {t(`clientStatus_${status}`)}</h2>{status !== 'active' && <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void reactivate()}>{t('clientReactivate')}</button>}</div>
    <p className="hint">{t('clientStatusHint')}</p>
    {client.followUpOn && <p>{t('clientFollowUpOn')}: <time dateTime={client.followUpOn}>{new Date(`${client.followUpOn}T12:00:00`).toLocaleDateString(language === 'de' ? 'de-DE' : 'uk-UA')}</time>{client.followUpNote && ` · ${client.followUpNote}`}</p>}
    {history.length > 0 && <><h3>{t('clientStatusHistory')}</h3><ul className="status-history">{history.slice(0, limit).map(entry => <li key={entry.id}><strong>{t(`clientStatus_${entry.status}`)}</strong><time dateTime={entry.at}>{new Date(entry.at).toLocaleDateString(language === 'de' ? 'de-DE' : 'uk-UA')}</time></li>)}</ul>{history.length > limit && <button className="text-link" onClick={() => setLimit(n => n + 10)}>{t('followUpShowMore')}</button>}</>}{error && <Notice error>{t('storageError')}</Notice>}
  </section>;
}
