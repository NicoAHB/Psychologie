import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { workItems, type WorkItem } from '../lib/workItems';
import { useI18n } from '../lib/i18n';
import { practiceToday } from '../lib/followUp';
import type { VaultController } from '../lib/useVault';
import { Notice } from './ui';

export function WorkBoard({ vault, onOpen, scope = 'care' }: { vault: VaultController; onOpen: (item: WorkItem) => void; scope?: 'care' | 'invoices' }) {
  const { t } = useI18n(); const data = vault.data!, day = practiceToday(data.settings);
  const entries = useMemo(() => workItems(data).filter(item => scope === 'invoices' ? item.kind === 'invoice' : item.kind !== 'invoice'), [data, day, scope]); const [limit, setLimit] = useState(6), [error, setError] = useState(false);
  const labels = { draft: 'draftResume', followUp: 'workFollowUp', appointment: 'completeAppointment', session: 'workDocument', invoice: 'workInvoice' } as const;
  if (scope === 'invoices' && !entries.length) return null;
  const Heading = scope === 'invoices' ? 'h3' : 'h2';
  return <section className={scope === 'invoices' ? 'work-board work-invoices' : 'card work-board work-care'}><div className="section-heading"><div><Heading>{t(scope === 'invoices' ? 'workInvoicesTitle' : 'workTitle')}</Heading><p>{t(scope === 'invoices' ? 'workInvoicesHint' : 'workHint')}</p></div></div>
    {!entries.length ? <p className="hint">{t('workEmpty')}</p> : <ul className="work-list">{entries.slice(0, limit).map(item => { const client = data.clients.find(c => c.id === item.clientId)!; return <li key={`${item.kind}:${item.id}`}><div><strong>{client.name}</strong><span>{t(labels[item.kind])} · {item.date}</span>{item.kind === 'followUp' && client.followUpNote && <small>{client.followUpNote}</small>}</div><div className="button-row"><button className="btn btn-secondary btn-small" aria-label={`${t(labels[item.kind])}: ${client.name}`} onClick={() => onOpen(item)}><ArrowRight size={16}/>{t('workOpen')}</button>{item.kind === 'followUp' && <button className="btn btn-ghost btn-small" onClick={() => { void vault.update(d => { const c = d.clients.find(c => c.id === item.clientId); if (c) { delete c.followUpOn; delete c.followUpNote; } }).catch(() => setError(true)); }}>{t('clientFollowUpDone')}</button>}</div></li>; })}</ul>}
    {entries.length > limit && <button className="text-link" onClick={() => setLimit(n => n + 10)}>{t('followUpShowMore')}</button>}{error && <Notice error>{t('storageError')}</Notice>}
  </section>;
}
