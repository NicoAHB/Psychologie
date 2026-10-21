import { useState, type FormEvent } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { invoiceMessage } from '../lib/invoiceMessage';
import { sendInvoiceTelegram, telegramConfigured, validTelegramChat } from '../lib/telegram';
import { uid, type Client, type TelegramDelivery } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

export function TelegramComposer({ vault, client, documentId, onClose }: { vault: VaultController; client: Client; documentId: string; onClose: () => void }) {
  const { t, language } = useI18n(); const document = vault.data!.documents.find(d => d.id === documentId)!;
  const invoice = vault.data!.invoices.find(i => i.id === document.invoiceId)!;
  const [text, setText] = useState(() => invoice ? invoiceMessage(invoice, client).body : translate(client.language, 'documentEmailBody')); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey>(); const [sentAt, setSentAt] = useState<string>();
  const unconfirmed = document.telegramDeliveries?.some(d => !d.acceptedAt);
  async function send(e: FormEvent) {
    e.preventDefault(); if (busy) return; setError(undefined); setBusy(true);
    try {
      if (!telegramConfigured || vault.demo) throw new Error('telegramNotConfigured');
      if (!validTelegramChat(client.telegramChatId)) throw new Error('telegramChatMissing');
      const blob = await vault.file(document.file.blobId, document.file.mimeType);
      const delivery: TelegramDelivery = { id: uid(), recipient: client.telegramChatId, requestedAt: new Date().toISOString(), text };
      await vault.update(d => { (d.documents.find(x => x.id === documentId)!.telegramDeliveries ??= []).push(delivery); });
      const receipt = await sendInvoiceTelegram(delivery, document.file, blob);
      await vault.update(d => { Object.assign(d.documents.find(x => x.id === documentId)!.telegramDeliveries!.find(x => x.id === delivery.id)!, receipt); });
      setSentAt(receipt.acceptedAt);
    } catch (e) { const key = e instanceof Error ? e.message : ''; setError(['telegramNotConfigured', 'telegramRateLimited', 'telegramChatMissing', 'authError'].includes(key) ? key as TextKey : 'telegramSendError'); }
    finally { setBusy(false); }
  }
  return <Modal title={t('telegramClientInvoice')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={send} noValidate>
    <Field label={t('telegramRecipient')}><input readOnly value={client.telegramChatId}/></Field>
    <Field label={t('emailMessage')} hint={t('telegramCaptionHint')}><textarea lang={client.language} rows={7} maxLength={1024} value={text} disabled={busy || !!sentAt} onChange={e => setText(e.target.value)}/></Field>
    <p className="document-attachment"><Paperclip size={17}/>{document.file.fileName}</p>
    <Notice>{t('telegramPrivacyHint')}</Notice>
    {(!telegramConfigured || vault.demo) && <Notice>{t('telegramNotConfigured')}</Notice>}
    {!validTelegramChat(client.telegramChatId) && <Notice>{t('telegramChatMissing')}</Notice>}
    {unconfirmed && !sentAt && <Notice>{t('telegramSendError')}</Notice>}
    {sentAt && <Notice>{t('telegramAccepted')} {new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(sentAt))}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}<p className="hint">{t('telegramHistoryHint')}</p>
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button>{!sentAt && <button className="btn btn-primary" disabled={busy || !telegramConfigured || vault.demo || !validTelegramChat(client.telegramChatId) || !text.trim() || text.length > 1024}><Send size={17}/>{t(busy ? 'working' : 'telegramSendNow')}</button>}</div>
  </form></Modal>;
}
