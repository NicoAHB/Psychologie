import type { EmailProvider } from './emailProvider.ts';
// Duplicate these small public checks in the deployable server tree: the Edge
// bundle must never depend on frontend source paths or browser configuration.
const validEndpoint = (value: string) => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,160}\/exec$/.test(value);
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
export interface ProviderMessage {
  key: string; to: string; subject: string; text: string;
  attachments?: { filename: string; content: string; content_type: string }[];
}
const safeErrors = ['emailGmailConnectionInvalid', 'emailGmailAddressMismatch', 'emailRateLimited', 'emailSendError', 'emailGmailDeliveryUnknown'];
/** HTTPS only, pinned Google origins, no cookies/Authorization headers. A
 * ContentService redirect is followed as GET; a POST is never replayed. */
export async function callGmailRelay(provider: EmailProvider, message: ProviderMessage | null, request: typeof fetch = fetch) {
  if (!provider.endpoint || !validEndpoint(provider.endpoint) || !provider.apiKey) throw new Error('emailGmailConnectionInvalid');
  const json = JSON.stringify({ version: 1, action: message ? 'send' : 'check', senderEmail: provider.senderEmail, senderName: provider.senderName,
    ...(message && { requestId: message.key, to: message.to, subject: message.subject, text: message.text, attachments: message.attachments ?? [] }) });
  const payload = json, timestamp = Date.now();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(provider.apiKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const signal = AbortSignal.timeout(25000);
  let response = await request(provider.endpoint, { method: 'POST', redirect: 'manual', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, timestamp, signature }) });
  if ([301, 302, 303].includes(response.status)) {
    const location = response.headers.get('location'); let url: URL;
    try { url = new URL(location ?? ''); } catch { throw new Error('emailGmailConnectionInvalid'); }
    if (url.origin !== 'https://script.googleusercontent.com' || url.pathname !== '/macros/echo' || url.username || url.password || url.hash) throw new Error('emailGmailConnectionInvalid');
    response = await request(url.href, { method: 'GET', redirect: 'error', signal });
  }
  if (!response.ok) throw new Error(response.status === 429 ? 'emailRateLimited' : 'emailGmailConnectionInvalid');
  let result; try { result = await response.json(); } catch { throw new Error('emailGmailConnectionInvalid'); }
  if (result?.ok !== true) throw new Error(safeErrors.includes(result?.error) ? result.error : 'emailGmailConnectionInvalid');
  if (!message) {
    if (result.accountEmail !== provider.senderEmail.toLowerCase()) throw new Error('emailGmailAddressMismatch');
    return result;
  }
  if (result.providerId !== `gmail/${message.key}` || typeof result.acceptedAt !== 'string' || !Number.isFinite(Date.parse(result.acceptedAt))) throw new Error('emailGmailDeliveryUnknown');
  return result;
}
export async function sendViaEmailProvider(provider: EmailProvider, message: ProviderMessage, request: typeof fetch = fetch): Promise<Response> {
  if (provider.provider === 'gmail') {
    try { const result = await callGmailRelay(provider, message, request); return Response.json({ id: result.providerId, acceptedAt: result.acceptedAt }); }
    catch (error) { const code = (error as Error).message; return Response.json({ error: safeErrors.includes(code) ? code : 'emailGmailDeliveryUnknown' }, { status: code === 'emailRateLimited' ? 429 : 502 }); }
  }
  return request('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(25000), headers: {
    Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': message.key,
  }, body: JSON.stringify({ from: provider.from, to: [message.to], subject: message.subject, text: message.text,
    ...(message.attachments?.length && { attachments: message.attachments }) }) });
}
