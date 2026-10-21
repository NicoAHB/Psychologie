// Explicit PDF delivery only. No message contents, tokens, chat ids or files are logged or stored here.
export interface TelegramEnvironment {
  APP_ORIGIN?: string; TELEGRAM_OWNER_USER_ID?: string; TELEGRAM_BOT_TOKEN?: string;
  SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string;
}
const LIMIT = 10 * 1024 * 1024;
async function limitedJson(req: Request) {
  const reader = req.body?.getReader(); if (!reader) throw new Error('invalid');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > Math.ceil(LIMIT * 4 / 3) + 15000) { await reader.cancel(); throw new Error('large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createTelegramHandler(env: TelegramEnvironment, request: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
    if (!env.APP_ORIGIN || req.headers.get('origin') !== env.APP_ORIGIN) return reply(403, { error: 'authError' });
    headers['Access-Control-Allow-Origin'] = env.APP_ORIGIN;
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type'; headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'invalidRequest' });
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_OWNER_USER_ID || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return reply(501, { error: 'telegramNotConfigured' });
    const authorization = req.headers.get('authorization'); if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'authError' });
    try {
      const auth = await request(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000) });
      if (!auth.ok || (await auth.json()).id !== env.TELEGRAM_OWNER_USER_ID) return reply(401, { error: 'authError' });
      let data; try { data = await limitedJson(req); } catch { return reply(400, { error: 'invalidRequest' }); }
      const { chatId, text, attachment } = data ?? {};
      // Positive numeric ids refer to private chats. Never accept groups, channels or usernames.
      if (typeof chatId !== 'string' || !/^[1-9]\d{0,15}$/.test(chatId) || !Number.isSafeInteger(Number(chatId)) || typeof text !== 'string' || !text.trim() || text.length > 1024) return reply(400, { error: 'invalidRequest' });
      if (!attachment || typeof attachment.filename !== 'string' || !/\.pdf$/i.test(attachment.filename) || attachment.filename.length > 180 || /[\x00-\x1f/\\]/.test(attachment.filename) || typeof attachment.content !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.content) || attachment.content.length % 4 || attachment.content.length > Math.ceil(LIMIT / 3) * 4) return reply(400, { error: 'invalidRequest' });
      const decoded = atob(attachment.content); if (!decoded.startsWith('%PDF-') || decoded.length > LIMIT) return reply(400, { error: 'invalidRequest' });
      const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
      const form = new FormData(); form.set('chat_id', chatId); form.set('caption', text);
      form.set('document', new Blob([bytes], { type: 'application/pdf' }), attachment.filename);
      // A single attempt. Telegram has no idempotency support; never retry automatically after a timeout.
      const response = await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(25000) });
      if (!response.ok) return reply(response.status === 429 ? 429 : 502, { error: response.status === 429 ? 'telegramRateLimited' : 'telegramSendError' });
      const result = await response.json(); const message = result?.result;
      if (result?.ok !== true || !Number.isSafeInteger(message?.message_id) || message.message_id <= 0 || String(message?.chat?.id) !== chatId || message.chat.type !== 'private' || !Number.isSafeInteger(message.date) || message.date <= 0) return reply(502, { error: 'telegramSendError' });
      return reply(200, { messageId: message.message_id, acceptedAt: new Date(message.date * 1000).toISOString() });
    } catch { return reply(502, { error: 'telegramSendError' }); }
  };
}
