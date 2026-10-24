import { useMemo, useState } from 'react';
import { FileText, Mail, MessageCircle, Undo2 } from 'lucide-react';
import { contactHistory, type ContactEvent } from '../lib/contactHistory';
import { dateLabel } from '../lib/dates';
import { useI18n } from '../lib/i18n';
import type { VaultController } from '../lib/useVault';
import { Field, Modal } from './ui';

export function ContactHistory({ vault, clientId, onDocument, onInvoice }: {
  vault: VaultController; clientId: string; onDocument: (id: string) => void; onInvoice: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const [channel, setChannel] = useState('all'), [limit, setLimit] = useState(30), [selectedId, setSelected] = useState<string>();
  const entries = useMemo(() => contactHistory(vault.data!, clientId), [vault.data, clientId]);
  const selected = entries.find(entry => entry.id === selectedId);
  const filtered = useMemo(() => entries.filter(e => channel === 'all' || e.channel === channel), [entries, channel]);
  const when = (entry: ContactEvent) => entry.dateOnly ? dateLabel(entry.at, language, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.at));
  return <section className="card contact-history" aria-label={t('contactHistoryTitle')}><div className="section-heading"><div><h2>{t('contactHistoryTitle')}</h2><p>{t('contactHistoryHint')}</p></div></div>
    <Field label={t('contactHistoryFilter')}><select value={channel} onChange={e => { setChannel(e.target.value); setLimit(30); }}>{(['all', 'email', 'telegram', 'return'] as const).map(c => <option key={c} value={c}>{t(c === 'all' ? 'all' : `contactChannel_${c}`)}</option>)}</select></Field>
    {!filtered.length ? <p className="hint">{t('contactHistoryEmpty')}</p> : <ol className="contact-history-list">{filtered.slice(0, limit).map(entry => <li key={entry.id}><button type="button" className="contact-event" onClick={() => setSelected(entry.id)}>
      <span className="contact-event-icon" aria-hidden="true">{entry.channel === 'email' ? <Mail size={18}/> : entry.channel === 'telegram' ? <MessageCircle size={18}/> : <Undo2 size={18}/>}</span>
      <span><time dateTime={entry.at}>{when(entry)}</time><strong>{entry.title}</strong><span>{t(`contactKind_${entry.kind}`)} · {t(`contactChannel_${entry.channel}`)}</span><small>{t(`contactStatus_${entry.status}`)}</small></span>
    </button></li>)}</ol>}
    {filtered.length > limit && <button type="button" className="text-link" onClick={() => setLimit(n => n + 30)}>{t('followUpShowMore')}</button>}
    {selected && <Modal title={t('contactHistoryDetails')} onClose={() => setSelected(undefined)}><article className="contact-event-details"><p><time dateTime={selected.at}>{when(selected)}</time> · {t(`contactStatus_${selected.status}`)}</p><h3>{selected.title}</h3>
      <p>{t(`contactKind_${selected.kind}`)} · {t(`contactChannel_${selected.channel}`)}</p>
      {selected.recipient && <p>{t('contactHistoryRecipient')}: {selected.recipient}</p>}{selected.fileName && <p className="file-name"><FileText size={16}/>{selected.fileName}</p>}
      {selected.body && <div className="pre-line contact-event-body" tabIndex={0} role="region" aria-label={t('contactHistoryMessage')}>{selected.body}</div>}
      {selected.status === 'sent' && <p className="hint">{t('contactHistoryReceiptHint')}</p>}
      <div className="form-actions">{selected.invoiceId && vault.data!.invoices.some(i => i.id === selected.invoiceId && i.clientId === clientId) ? <button className="btn btn-secondary" onClick={() => { onInvoice(selected.invoiceId!); setSelected(undefined); }}>{t('invoiceOpen')}</button>
        : selected.documentId && <button className="btn btn-secondary" onClick={() => { onDocument(selected.documentId!); setSelected(undefined); }}>{t('contactHistoryOpenDocument')}</button>}
        <button className="btn btn-secondary" onClick={() => setSelected(undefined)}>{t('close')}</button></div>
    </article></Modal>}
  </section>;
}
