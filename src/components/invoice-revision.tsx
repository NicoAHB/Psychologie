import { useState, type FormEvent } from 'react';
import { bankFor } from '../lib/currency';
import { addDays, money, parseMoney, today } from '../lib/dates';
import { useI18n, type TextKey } from '../lib/i18n';
import { reviseInvoice, validDay } from '../lib/invoice';
import { uid, type Invoice, type Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

export function InvoiceRevisionDialog({ vault, invoice, correct, onClose, onSaved }: { vault: VaultController; invoice: Invoice; correct: boolean; onClose: () => void; onSaved: (invoice: Invoice) => void }) {
  const { t, language } = useI18n(); const [issuedAt, setIssuedAt] = useState(today() < invoice.issuedAt ? invoice.issuedAt : today());
  const [dueOn, setDueOn] = useState(addDays(issuedAt, 14)); const [reason, setReason] = useState('');
  const [recipient, setRecipient] = useState({ ...invoice.recipient }); const [sender, setSender] = useState(structuredClone(invoice.sender));
  const [account, setAccount] = useState(invoice.paymentAccount ?? bankFor(invoice.sender, invoice.currency ?? 'EUR'));
  const [lang, setLang] = useState(invoice.language);
  const [lines, setLines] = useState(invoice.lines.map(l => ({ sessionId: l.sessionId, description: l.description, amount: String(Math.round(l.amountCents / 100)) })));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  const anyPaid = invoice.lines.some(l => !!vault.data!.sessions.find(s => s.id === l.sessionId)?.paidAt);
  const amount = lines.reduce((sum, l) => /^\d{1,6}$/.test(l.amount) ? sum + Number(l.amount) * 100 : sum, 0);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined); setBusy(true);
    try {
      if (!validDay(issuedAt) || correct && (!validDay(dueOn) || dueOn < issuedAt)) throw new Error('invalidInvoiceDate');
      let saved: Invoice | undefined;
      const revision = { issuedAt, reason, cancellationId: uid(), ...(correct && { replacement: { id: uid(), dueOn, language: lang, recipient, sender, paymentAccount: account, lines: lines.map(l => ({ sessionId: l.sessionId, description: l.description, amountCents: parseMoney(l.amount) })) } }) };
      await vault.update(d => { const result = reviseInvoice(d, invoice.id, revision); saved = result.replacement ?? result.cancellation; });
      onSaved(saved!);
    } catch (e) { const message = e instanceof Error ? e.message : ''; setError(['invoiceInactive', 'invoiceSessionsMissing', 'invoicePaidAmountLocked', 'invalidInvoiceDate', 'invalidAmount', 'rateRequired', 'required'].includes(message) ? message as TextKey : 'storageError'); }
    finally { setBusy(false); }
  }
  return <Modal title={t(correct ? 'invoiceCorrect' : 'invoiceCancel')} onClose={() => { if (!busy) onClose(); }} wide={correct}><form onSubmit={submit} noValidate>
    <Notice>{t(correct ? 'invoiceCorrectionHint' : 'invoiceCancellationHint')}</Notice>
    {anyPaid && <Notice>{t('invoiceRefundHint')}{correct && <p>{t('invoicePaidAmountLocked')}</p>}</Notice>}
    <Field label={t('invoiceRevisionReason')} hint={t('invoiceReasonHint')}><textarea rows={2} maxLength={600} value={reason} onChange={e => setReason(e.target.value)}/></Field>
    <div className="form-grid"><Field label={t('invoiceDate')}><input type="date" min={invoice.issuedAt} value={issuedAt} onChange={e => { setIssuedAt(e.target.value); if (validDay(e.target.value)) setDueOn(addDays(e.target.value, 14)); }}/></Field>{correct && <Field label={t('invoiceDueOn')}><input type="date" min={issuedAt} value={dueOn} onChange={e => setDueOn(e.target.value)}/></Field>}</div>
    {correct && <><Field label={t('invoiceRecipientName')}><input value={recipient.name} maxLength={160} onChange={e => setRecipient({ ...recipient, name: e.target.value })}/></Field><Field label={t('invoiceRecipientAddress')}><textarea value={recipient.address} rows={3} maxLength={1000} onChange={e => setRecipient({ ...recipient, address: e.target.value })}/></Field>
      <Field label={t('invoiceLanguage')}><select value={lang} onChange={e => setLang(e.target.value as Language)}><option value="de">Deutsch</option><option value="uk">Українська</option></select></Field>
      <div className="revision-lines">{lines.map((line, index) => <fieldset key={line.sessionId} className="bank-account"><legend>{t('invoicePosition')} {index + 1}</legend><Field label={t('invoiceItem')}><textarea value={line.description} rows={2} maxLength={1000} onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, description: e.target.value } : l))}/></Field><Field label={`${t('invoiceAmount')} (${invoice.currency ?? 'EUR'})`}><input inputMode="numeric" readOnly={anyPaid} value={line.amount} onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, amount: e.target.value } : l))}/></Field></fieldset>)}</div>
      <details className="revision-sender"><summary>{t('invoiceSenderDetails')}</summary><button type="button" className="btn btn-secondary btn-small" onClick={() => { const profile = structuredClone(vault.data!.settings.practice); setSender(profile); setAccount(bankFor(profile, invoice.currency ?? 'EUR')); }}>{t('useCurrentPractice')}</button>
        <Field label={t('practiceName')}><input value={sender.name} maxLength={160} onChange={e => setSender({ ...sender, name: e.target.value })}/></Field><Field label={t('practiceAddress')}><textarea rows={3} value={sender.address} maxLength={1000} onChange={e => setSender({ ...sender, address: e.target.value })}/></Field>
        <Field label={t('invoiceTaxId')}><input value={sender.taxId} maxLength={160} onChange={e => setSender({ ...sender, taxId: e.target.value })}/></Field><Field label={t('practiceTaxNote')}><textarea value={sender.taxNote} rows={2} maxLength={1000} onChange={e => setSender({ ...sender, taxNote: e.target.value })}/></Field>
        {(['holder', 'iban', 'bank', 'bic'] as const).map(key => <Field key={key} label={key === 'holder' ? t('accountHolder') : key === 'iban' ? 'IBAN' : key === 'bank' ? t('invoiceBank') : 'BIC / SWIFT'}><input value={account[key]} maxLength={160} onChange={e => setAccount({ ...account, [key]: e.target.value })}/></Field>)}
      </details>
    </>}
    <p className="revision-total">{t('invoiceTotal')}: <strong>{money(correct ? amount : -invoice.totalCents, language, invoice.currency ?? 'EUR')}</strong></p>
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className={`btn ${correct ? 'btn-primary' : 'btn-danger'}`} disabled={busy || !reason.trim()}>{t(busy ? 'working' : correct ? 'invoiceCorrectionSave' : 'invoiceCancelSave')}</button></div>
  </form></Modal>;
}
