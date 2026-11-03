import { assertHomeworkDocument, homeworkDeliveryNeedsConfirmation } from '../lib/homeworkDelivery';
import { useState, type FormEvent } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { canRemindInvoice, cancellationOf, invoiceOutstanding } from '../lib/invoice';
import { invoiceMessage } from '../lib/invoiceMessage';
import { sendInvoiceTelegram, telegramConfigured, validTelegramChat } from '../lib/telegram';
import { uid, type Client, type TelegramDelivery } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

export function TelegramComposer({ vault, client, documentId, onClose, purpose = vault.data!.documents.find(d=>d.id===documentId)?.homeworkAssignmentId ? 'homework' : 'invoice' }: { vault: VaultController; client: Client; documentId: string; onClose: () => void; purpose?: 'invoice' | 'paymentReminder' | 'homework' }) {
  const { t, language } = useI18n(); const document = vault.data!.documents.find(d => d.id === documentId)!;
  const invoice = vault.data!.invoices.find(i => i.id === document.invoiceId)!;
  const [text, setText] = useState(() => invoice && purpose!=='homework' ? invoiceMessage(invoice, client, purpose, invoiceOutstanding(vault.data!, invoice) ?? 0).body : translate(client.language,purpose==='homework'?(document.returnExpected?'hwEmailBodyReturn':'hwEmailBody'):'documentEmailBody')); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey>(); const [sentAt, setSentAt] = useState<string>();
  const inactive = !!invoice && !!cancellationOf(vault.data!, invoice.id); const [expectedBalance] = useState(() => invoice ? invoiceOutstanding(vault.data!, invoice) : null); const reminderUnavailable = purpose === 'paymentReminder' && (!invoice || !canRemindInvoice(vault.data!, invoice, expectedBalance));
  const unconfirmed = document.telegramDeliveries?.some(d => !d.acceptedAt && d.recipient === client.telegramChatId && (d.purpose ?? 'invoice') === purpose);
  const [repeatConfirmed,setRepeatConfirmed]=useState(false);const confirmRepeat=purpose==='homework'&&homeworkDeliveryNeedsConfirmation(vault.data!,document);
  async function send(e: FormEvent) {
    e.preventDefault(); if (busy||confirmRepeat&&!repeatConfirmed) return; setError(undefined); setBusy(true);
    try {
      assertHomeworkDocument(vault.getData()!,document);
      if (!telegramConfigured || vault.demo) throw new Error('telegramNotConfigured');
      if (!validTelegramChat(client.telegramChatId)) throw new Error('telegramChatMissing');
      if (inactive) throw new Error('invoiceInactive');
      if (reminderUnavailable) throw new Error('invoiceReminderUnavailable');
      const blob = await vault.file(document.file.blobId, document.file.mimeType);
      const delivery: TelegramDelivery = { id: uid(), recipient: client.telegramChatId, requestedAt: new Date().toISOString(), text, ...(purpose !== 'invoice' && { purpose }) };
      await vault.update(d => { (d.documents.find(x => x.id === documentId)!.telegramDeliveries ??= []).push(delivery); });
      const receipt = await sendInvoiceTelegram(delivery, document.file, blob);
      await vault.update(d => { Object.assign(d.documents.find(x => x.id === documentId)!.telegramDeliveries!.find(x => x.id === delivery.id)!, receipt); });
      setSentAt(receipt.acceptedAt);
    } catch (e) { const key = e instanceof Error ? e.message : ''; setError(['hwPdfChanged', 'telegramNotConfigured', 'telegramRateLimited', 'telegramChatMissing', 'authError', 'invoiceInactive', 'invoiceReminderUnavailable'].includes(key) ? key as TextKey : 'telegramSendError'); }
    finally { setBusy(false); }
  }
  return <Modal title={t(purpose === 'paymentReminder' ? 'invoiceReminderTitle' : purpose==='homework'?'hwTelegramTitle':'telegramClientInvoice')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={send} noValidate>
    <Field label={t('telegramRecipient')}><input readOnly value={client.telegramChatId}/></Field>
    <Field label={t('emailMessage')} hint={t('telegramCaptionHint')}><textarea lang={client.language} rows={7} maxLength={1024} value={text} disabled={busy || !!sentAt} onChange={e => setText(e.target.value)}/></Field>
    <p className="document-attachment"><Paperclip size={17}/>{document.file.fileName}</p>
    <Notice>{t('telegramPrivacyHint')}</Notice>
    {purpose === 'paymentReminder' && <Notice>{t('invoiceReminderHint')}</Notice>}
    {inactive && <Notice error>{t('invoiceInactive')}</Notice>}
    {reminderUnavailable && <Notice error>{t('invoiceReminderUnavailable')}</Notice>}
    {(!telegramConfigured || vault.demo) && <Notice>{t('telegramNotConfigured')}</Notice>}
    {!validTelegramChat(client.telegramChatId) && <Notice>{t('telegramChatMissing')}</Notice>}
    {confirmRepeat&&!sentAt&&<label className="check-label"><input type="checkbox" checked={repeatConfirmed} disabled={busy} onChange={e=>setRepeatConfirmed(e.target.checked)}/><span>{t('hwResendConfirm')}</span></label>}
    {unconfirmed && !sentAt && <Notice>{t('telegramSendError')}</Notice>}
    {sentAt && <Notice>{t('telegramAccepted')} {new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(sentAt))}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}<p className="hint">{t('telegramHistoryHint')}</p>
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button>{!sentAt && <button className="btn btn-primary" disabled={busy || confirmRepeat&&!repeatConfirmed || inactive || reminderUnavailable || !telegramConfigured || vault.demo || !validTelegramChat(client.telegramChatId) || !text.trim() || text.length > 1024}><Send size={17}/>{t(busy ? 'working' : 'telegramSendNow')}</button>}</div>
  </form></Modal>;
}
