import { useState } from 'react';
import { syncConflicts, resolveConflict, type SyncConflict } from '../lib/crdt';
import { useI18n, type TextKey } from '../lib/i18n';
import type { VaultController } from '../lib/useVault';
import type { Invoice, SessionDraftValues, MarketingConsent } from '../lib/types';
import { dateLabel, money } from '../lib/dates';
import { ImageView, Modal, Notice } from './ui';
import { InvoiceSheet } from './invoices';
import { MEMO_MAX_LABEL, MEMO_MAX_SUMMARY } from '../lib/audioMemos';

function ConflictEditor({ vault, conflict }: { vault: VaultController; conflict: SyncConflict }) {
  const { t, language } = useI18n(); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const record = conflict.collection !== 'settings' ? vault.data![conflict.collection].find(r => r.id === conflict.id) : undefined;
  const clientId = record && 'clientId' in record ? record.clientId : conflict.collection === 'clients' ? conflict.id : undefined;
  const clientName = vault.data!.clients.find(c => c.id === clientId)?.name;
  const collectionLabels: Record<SyncConflict['collection'], TextKey> = { clients: 'clients', appointments: 'appointments', sessions: 'sessions', notes: 'addNote', invoices: 'invoiceTitle', assessments: 'questionnaires', templates: 'templates', documents: 'clientDocuments', availability: 'availabilityList', audioMemos: 'memoSection', sessionDrafts: 'draftsTitle', settings: 'settings', messageTemplates: 'messageTemplates', marketingCampaigns: 'marketingCampaigns', newsletters: 'newsletter' };
  const fieldLabels: Record<string, TextKey> = { preparation: 'preparation', notes: 'sessionNotes', name: 'name', address: 'clientAddress', email: 'clientEmail', contact: 'contact', language: 'language', currency: 'billingCurrency', homework: 'homeworkFor', caption: 'caption', label: 'memoLabel', summary: 'memoSummary', $recording: 'memoSection', $amount: 'syncConflictBilling', $snapshot: 'invoiceTitle', $exists: 'syncConflictDeleted', avatarId: 'syncConflictAvatar' };
  const title = clientName ?? (record && 'name' in record ? record.name : t(collectionLabels[conflict.collection]));
  const canCombine = conflict.variants.every(v => typeof v.value === 'string');
  const textLimit = conflict.collection === 'audioMemos' ? conflict.field === 'summary' ? MEMO_MAX_SUMMARY : conflict.field === 'label' ? MEMO_MAX_LABEL : 50000 : 50000;
  const save = async (index: number, combined?: string) => {
    setBusy(true); setError(false);
    try { await vault.update(d => resolveConflict(d, conflict, conflict.variants[index], combined)); }
    catch { setError(true); } finally { setBusy(false); }
  };
  return <section className="sync-conflict"><h3>{title} · {t(fieldLabels[conflict.field] ?? collectionLabels[conflict.collection])}</h3><p className="hint">{t('syncConflictVariants')}</p>
    {conflict.variants.map((v, i) => {
      const consent = conflict.field.startsWith('marketingConsent:') && v.value ? v.value as unknown as MarketingConsent : undefined;
      const amount = conflict.field === '$amount' ? v.value as unknown as { feeCents: number; billing?: { currency: 'EUR' | 'UAH'; amountCents: number; rate?: { micros: number; date: string } }; paidAt?: string | null } : undefined;
      const draft = conflict.collection === 'sessionDrafts' && conflict.field === 'payload' ? v.value as unknown as SessionDraftValues : undefined;
      return <div className="conflict-variant" key={`${v.actor}:${v.sequence}`}>
        {consent ? <div><p>{consent.destination}</p><p>{t('date')}: {consent.grantedAt}</p>{consent.revokedAt&&<p>{t('marketingConsentMissing')} · {consent.revokedAt}</p>}</div> : draft ? <div><p><strong>{draft.date} · {draft.time}</strong></p><h4>{t('sessionNotes')}</h4><p className="pre-line">{draft.notes}</p><h4>{t('homework')}</h4><p className="pre-line">{draft.homework}</p><h4>{t('preparation')}</h4><p className="pre-line">{draft.nextTopics}</p><p>{t('photosAttached')}: {draft.photos.length} · {t('memoSection')}: {draft.memos.length}</p><ul>{draft.memos.map(memo => <li key={memo.id}>{memo.label || t('memoDefaultTitle')}: {memo.summary}</li>)}</ul></div>
          : conflict.field === '$snapshot' ? <div className="table-scroll"><InvoiceSheet invoice={{ ...v.value as unknown as Invoice, id: conflict.id }} paid={null}/></div>
          : amount ? <div><p><strong>{money(amount.feeCents, language)}</strong>{amount.billing?.currency === 'UAH' ? ` · ${money(amount.billing.amountCents, language, 'UAH')}` : ''}</p><p>{t('paymentStatus')}: {amount.paidAt ? `${t('paid')} · ${dateLabel(amount.paidAt, language, { dateStyle: 'short' })}` : t('unpaid')}</p>{amount.billing?.rate && <p>{t('exchangeRate')}: {(amount.billing.rate.micros / 1e6).toLocaleString(language === 'uk' ? 'uk-UA' : 'de-DE', { maximumFractionDigits: 6 })} · {amount.billing.rate.date}</p>}</div>
            : conflict.field === 'avatarId' && typeof v.value === 'string' ? <ImageView id={v.value} vault={vault} alt={t('syncConflictAvatar')} className="conflict-avatar"/>
              : <pre>{conflict.field === '$exists' ? t(v.value ? 'syncConflictRestore' : 'syncConflictKeepDeleted') : v.value === undefined ? t('syncConflictRemoved') : typeof v.value === 'string' ? v.value : JSON.stringify(v.value, null, 2)}</pre>}
        <button className="btn btn-secondary" disabled={busy} onClick={() => void save(i)}>{t('syncConflictChoose')} {i + 1}</button></div>;
    })}
    {canCombine && <><label className="field"><span>{t('syncConflictCombine')}</span><textarea value={text} rows={5} maxLength={textLimit} onChange={e => setText(e.target.value)}/></label><button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void save(0, text)}>{t('syncConflictSave')}</button></>}
    {error && <Notice error>{t('storageError')}</Notice>}</section>;
}
export function SyncConflicts({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false); const conflicts = vault.data ? syncConflicts(vault.data) : [];
  if (!conflicts.length) return null;
  return <><Notice><span>{t('syncConflictsNotice').replace('{n}', String(conflicts.length))}</span> <button className="text-link" onClick={() => setOpen(true)}>{t('syncConflictsReview')}</button></Notice>{open && <Modal wide title={t('syncConflictsReview')} onClose={() => setOpen(false)}>{conflicts.map(c => <ConflictEditor vault={vault} conflict={c} key={`${c.entity}:${c.field}`}/>)}</Modal>}</>;
}
