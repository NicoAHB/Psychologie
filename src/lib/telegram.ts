import { toBase64 } from './crypto';
import { cloudConfigured, getCloud } from './cloud';
import type { DocumentFile, TelegramDelivery } from './types';

const env: Partial<Record<string, string>> = import.meta.env ?? {};
export const telegramConfigured = cloudConfigured && env.VITE_TELEGRAM_ENABLED === 'true';
/** Private chats only: a confidential invoice must never accidentally go to a group. */
export const validTelegramChat = (value: string) => /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
export async function sendInvoiceTelegram(delivery: TelegramDelivery, file: DocumentFile, blob: Blob): Promise<{ messageId: number; acceptedAt: string }> {
  const cloud = await getCloud(); if (!cloud) throw new Error('telegramNotConfigured');
  const { data: auth, error: authError } = await cloud.auth.getUser(); if (authError || !auth.user) throw new Error('authError');
  if (!validTelegramChat(delivery.recipient) || !delivery.text.trim() || delivery.text.length > 1024 || file.mimeType !== 'application/pdf') throw new Error('telegramSendError');
  // No automatic retry: Telegram does not offer an idempotency key for sendDocument.
  const { data, error } = await cloud.functions.invoke('send-client-telegram', { body: {
    chatId: delivery.recipient, text: delivery.text,
    attachment: { filename: file.fileName, content: toBase64(new Uint8Array(await blob.arrayBuffer())) },
  } });
  if (error) {
    let code = ''; try { code = (await error.context?.json())?.error; } catch { /* An uncertain request stays unconfirmed. */ }
    throw new Error(['telegramNotConfigured', 'telegramRateLimited', 'authError'].includes(code) ? code : 'telegramSendError');
  }
  if (!Number.isSafeInteger(data?.messageId) || data.messageId <= 0 || typeof data.acceptedAt !== 'string' || Number.isNaN(Date.parse(data.acceptedAt))) throw new Error('telegramSendError');
  return { messageId: data.messageId, acceptedAt: data.acceptedAt };
}
