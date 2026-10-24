import { toBase64 } from './crypto';
import { cloudConfigured, getCloud } from './cloud';
import { uid, type ClientDocument, type DocumentFile, type EmailDelivery } from './types';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.odt';
const TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text' };
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export async function inspectDocument(file: File): Promise<{ bytes: Uint8Array<ArrayBuffer>; fileName: string; mimeType: string }> {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) throw new Error('documentSizeError');
  const ext = file.name.split('.').at(-1)?.toLowerCase() ?? ''; const mimeType = TYPES[ext];
  if (!mimeType || /[\r\n\x00-\x1f/\\]/.test(file.name) || file.name.length > 180) throw new Error('documentTypeError');
  const bytes = new Uint8Array(await file.arrayBuffer()); const ascii = (a: number, b: number) => String.fromCharCode(...bytes.subarray(a, b));
  const matches = ext === 'pdf' ? ascii(0, 5) === '%PDF-' : ext === 'png' ? bytes[0] === 137 && ascii(1, 4) === 'PNG'
    : ['jpg', 'jpeg'].includes(ext) ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : ext === 'webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    : ['docx', 'odt'].includes(ext) ? ascii(0, 2) === 'PK' : !bytes.includes(0);
  if (!matches) throw new Error('documentTypeError');
  return { bytes, fileName: file.name, mimeType };
}
/** Retry an uncertain request with exactly the same id and contents; a confirmed resend gets a new id. */
export function prepareDelivery(document: ClientDocument, recipient: string, subject: string, body: string, now = new Date().toISOString(), purpose: EmailDelivery['purpose'] = 'invoice'): EmailDelivery {
  if (!validEmail(recipient) || !subject.trim() || subject.length > 180 || /[\r\n]/.test(subject) || body.length > 12000) throw new Error('invalidClientEmail');
  const pending = document.deliveries.find(d => !d.acceptedAt && d.recipient === recipient && d.subject === subject && d.body === body && (d.purpose ?? 'invoice') === purpose);
  // Resend retains idempotency keys for 24h. Never blindly repeat an uncertain request after that window.
  if (pending && Date.parse(now) - Date.parse(pending.requestedAt) >= 23 * 3600000) throw new Error('emailRetryExpired');
  return pending ?? { id: uid(), recipient, requestedAt: now, subject, body, ...(purpose === 'paymentReminder' && { purpose }) };
}
// Availability is checked by the server; provider changes no longer need a Pages rebuild.
export const emailConfigured = cloudConfigured;
export interface EmailReceipt { providerId: string; acceptedAt: string }
/** Plaintext leaves the encrypted vault only for this explicit, authenticated email request. Never persist it server-side. */
export async function sendDocumentEmail(delivery: EmailDelivery, file: DocumentFile, blob: Blob, signal?: AbortSignal): Promise<EmailReceipt> {
  const cloud = await getCloud(); if (!cloud) throw new Error('emailNotConfigured');
  const { data: auth, error: authError } = await cloud.auth.getUser(); if (authError || !auth.user) throw new Error('authError');
  const { data, error } = await cloud.functions.invoke('send-client-email', { signal, body: {
    requestId: delivery.id, to: delivery.recipient, subject: delivery.subject, text: delivery.body,
    attachment: { filename: file.fileName, contentType: file.mimeType, content: toBase64(new Uint8Array(await blob.arrayBuffer())) },
  } });
  if (error) {
    let code = ''; try { code = (await error.context?.json())?.error; } catch { /* No response body on network failure. */ }
    throw new Error(['emailNotConfigured', 'emailSetupRequired', 'emailProviderKeyInvalid', 'emailSenderNotVerified', 'emailRateLimited', 'authError'].includes(code) ? code : 'emailSendError');
  }
  if (!data || typeof data.providerId !== 'string' || !data.providerId || typeof data.acceptedAt !== 'string' || Number.isNaN(Date.parse(data.acceptedAt))) throw new Error('emailSendError');
  return { providerId: data.providerId, acceptedAt: data.acceptedAt };
}
export function downloadDocument(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
