import { emailSettingsRpc, loadEmailProvider, publicEmailStatus, emailProviderError } from '../_shared/emailProvider.ts';
import { callGmailRelay, sendViaEmailProvider } from '../_shared/gmailRelay.ts';
// No request bodies, recipient addresses, attachments or provider errors are written to logs or the database.
export interface EmailEnvironment {
  APP_ORIGIN?: string; EMAIL_OWNER_USER_ID?: string; EMAIL_FROM?: string; RESEND_API_KEY?: string;
  SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string; SUPABASE_SERVICE_ROLE_KEY?: string;
}
const LIMIT = 10 * 1024 * 1024;
const validEmail = (s: unknown): s is string => typeof s === 'string' && s.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
const TYPES: Record<string, string> = { ics: 'text/calendar', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text' };
async function limitedJson(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error('invalid');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > Math.ceil(LIMIT * 4 / 3) + 50000) { await reader.cancel(); throw new Error('large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createEmailHandler(env: EmailEnvironment, request: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (status: number, value: object) => new Response(JSON.stringify(value), { status, headers });
    if (!env.APP_ORIGIN || req.headers.get('origin') !== env.APP_ORIGIN) return reply(403, { error: 'authError' });
    headers['Access-Control-Allow-Origin'] = env.APP_ORIGIN;
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'invalidRequest' });
    if (!env.EMAIL_OWNER_USER_ID || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return reply(501, { error: 'emailSetupRequired' });
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'authError' });
    try {
      const auth = await request(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000) });
      if (!auth.ok) return reply(401, { error: 'authError' });
      const user = await auth.json();
      if (user.id !== env.EMAIL_OWNER_USER_ID) return reply(401, { error: 'authError' });
      let data; try { data = await limitedJson(req); } catch { return reply(400, { error: 'invalidRequest' }); }
      if (!data || typeof data !== 'object') return reply(400, { error: 'invalidRequest' });
      let provider;
      try { provider = await loadEmailProvider(env, user.id, request); }
      catch (error) { const missing = (error as Error).message === 'emailSetupRequired'; return reply(missing ? 501 : 503, { error: missing ? 'emailSetupRequired' : 'emailConnectionError' }); }
      if (data.action === 'status') return reply(200, publicEmailStatus(provider, validEmail(user.email) ? user.email : ''));
      if (data.action === 'save') {
        if (!provider.editable) return reply(501, { error: 'emailSetupRequired' });
        const { senderEmail, senderName, enabled, apiKey } = data;
        const providerKind = data.provider ?? provider.provider;
        const endpoint = providerKind === 'gmail' ? data.endpoint ?? provider.endpoint : '';
        if (!validEmail(senderEmail) || typeof senderName !== 'string' || senderName.length > 100 || /[\x00-\x1f\x7f<>]/.test(senderName)
          || !['resend','gmail'].includes(providerKind) || typeof endpoint !== 'string'
          || providerKind === 'gmail' && (!/^[A-Za-z0-9._%+-]+@(gmail\.com|googlemail\.com)$/i.test(senderEmail)
            || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,160}\/exec$/.test(endpoint))
          || typeof enabled !== 'boolean' || typeof apiKey !== 'string' || apiKey && !(providerKind === 'gmail' ? /^gmail_[0-9a-f]{64}$/ : /^re_[A-Za-z0-9_-]{10,200}$/).test(apiKey)
          || providerKind !== provider.provider && !apiKey
          || !apiKey && provider.source !== 'saved' && !provider.apiKey) return reply(400, { error: 'emailSettingsInvalid' });
        try {
          if (providerKind === 'gmail' && enabled) {
            // Validate account/code/URL without sending an email. A paused
            // connection can always be disabled even if Google is unavailable.
            let credential = apiKey || provider.apiKey;
            if (!credential) credential = (await emailSettingsRpc(env, 'get_email_provider_settings', { p_owner: user.id }, request))?.apiKey;
            try { await callGmailRelay({ ...provider, provider: 'gmail', apiKey: credential, senderEmail: senderEmail.toLowerCase(), senderName, endpoint }, null, request); }
            catch (error) { const code = (error as Error).message; return reply(502, { error: ['emailGmailAddressMismatch', 'emailGmailConnectionInvalid'].includes(code) ? code : 'emailGmailConnectionInvalid' }); }
          }
          await emailSettingsRpc(env, 'save_email_provider_settings', { p_owner: user.id, p_email: providerKind === 'gmail' ? senderEmail.toLowerCase() : senderEmail,
            p_name: senderName, p_enabled: enabled, p_key: apiKey || (provider.source === 'environment' ? provider.apiKey : null),
            p_provider: providerKind, p_endpoint: endpoint }, request);
          provider = await loadEmailProvider(env, user.id, request);
          return reply(200, publicEmailStatus(provider, validEmail(user.email) ? user.email : ''));
        } catch { return reply(503, { error: 'emailSetupRequired' }); }
      }
      if (!provider.apiKey || !provider.from) return reply(501, { error: 'emailNotConfigured' });
      if (data.action === 'test') {
        // The recipient is exclusively the verified signed-in account, never caller input.
        if (!validEmail(user.email) || !user.email_confirmed_at || typeof data.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.requestId) || !['de', 'uk'].includes(data.language)) return reply(400, { error: 'emailTestAccountMissing' });
        const uk = data.language === 'uk';
        const result = await sendViaEmailProvider(provider, { key: `praxisraum/test/${user.id}/${data.requestId}`, to: user.email, subject: uk ? 'Praxisraum: перевірка електронної пошти' : 'Praxisraum: E-Mail-Test',
          text: uk ? 'Це тестове повідомлення з Praxisraum. Воно не містить даних клієнтів.' : 'Dies ist eine Testnachricht aus Praxisraum. Sie enthält keine Klientendaten.' }, request);
        if (!result.ok) return reply(result.status === 429 ? 429 : 502, { error: await emailProviderError(result) });
        const value = await result.json();
        if (typeof value.id !== 'string' || !value.id) return reply(502, { error: 'emailSendError' });
        return reply(200, { providerId: value.id, acceptedAt: value.acceptedAt ?? new Date().toISOString() });
      }
      if (data.action !== undefined) return reply(400, { error: 'invalidRequest' });
      const { requestId, to, subject, text, attachment } = data;
      if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) || !validEmail(to) || typeof subject !== 'string' || !subject.trim() || subject.length > 180 || /[\r\n]/.test(subject) || typeof text !== 'string' || text.length > 12000) return reply(400, { error: 'invalidRequest' });
      if (!attachment || typeof attachment.filename !== 'string' || !attachment.filename || attachment.filename.length > 180 || /[\r\n\x00-\x1f/\\]/.test(attachment.filename) || typeof attachment.content !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.content) || attachment.content.length > Math.ceil(LIMIT / 3) * 4 || attachment.content.length % 4) return reply(400, { error: 'invalidRequest' });
      const extension = attachment.filename.split('.').at(-1)?.toLowerCase();
      if (!extension || !TYPES[extension] || TYPES[extension] !== attachment.contentType) return reply(400, { error: 'invalidRequest' });
      const decoded = atob(attachment.content); if (!decoded.length || decoded.length > LIMIT) return reply(400, { error: 'invalidRequest' });
      let calendar = ''; try { if (extension === 'ics') calendar = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(decoded, c => c.charCodeAt(0))); } catch { return reply(400, { error: 'invalidRequest' }); }
      const safeCalendar = decoded.length <= 32768 && calendar.startsWith('BEGIN:VCALENDAR\r\n') && calendar.endsWith('END:VCALENDAR\r\n') && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(calendar) && calendar.split('\r\n').every(line => !line || line.startsWith(' ') || /^(BEGIN:(VCALENDAR|VEVENT)|END:(VCALENDAR|VEVENT)|VERSION:2\.0|PRODID:|CALSCALE:GREGORIAN|METHOD:PUBLISH|X-WR-CALNAME:|UID:|DTSTAMP:|DTSTART:|DTEND:|SUMMARY:|DESCRIPTION:)/.test(line));
      const matches = extension === 'ics' ? safeCalendar : extension === 'pdf' ? decoded.startsWith('%PDF-') : extension === 'png' ? decoded.startsWith('\x89PNG') : ['jpg', 'jpeg'].includes(extension) ? decoded.startsWith('\xff\xd8\xff') : extension === 'webp' ? decoded.startsWith('RIFF') && decoded.slice(8, 12) === 'WEBP' : ['docx', 'odt'].includes(extension) ? decoded.startsWith('PK') : !decoded.includes('\x00');
      if (!matches) return reply(400, { error: 'invalidRequest' });
      const response = await sendViaEmailProvider(provider, { key: `praxisraum/${env.EMAIL_OWNER_USER_ID}/${requestId}`, to, subject, text,
        attachments: [{ filename: attachment.filename, content: attachment.content, content_type: attachment.contentType }] }, request);
      if (!response.ok) return reply(response.status === 429 ? 429 : 502, { error: await emailProviderError(response) });
      const result = await response.json(); if (typeof result.id !== 'string' || !result.id) return reply(502, { error: 'emailSendError' });
      return reply(200, { providerId: result.id, acceptedAt: result.acceptedAt ?? new Date().toISOString() });
    } catch { return reply(502, { error: 'emailSendError' }); }
  };
}
