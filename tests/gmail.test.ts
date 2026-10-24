import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { createHmac, createHash } from 'node:crypto';
import { callGmailRelay, sendViaEmailProvider, type ProviderMessage } from '../supabase/functions/_shared/gmailRelay';
import type { EmailProvider } from '../supabase/functions/_shared/emailProvider';
import { newGmailConnectionKey, validGmailAddress, validGmailEndpoint, validProviderCredential } from '../src/lib/emailConnection';
import { createEmailHandler } from '../supabase/functions/send-client-email/handler';
import { uid } from '../src/lib/types';
const endpoint = 'https://script.google.com/macros/s/AKfycb_synthetic_deployment_123456789/exec';
const key = `gmail_${'a'.repeat(64)}`, address = 'practice@gmail.com';
const provider: EmailProvider = { provider: 'gmail', endpoint, apiKey: key, from: `Praxis <${address}>`, senderEmail: address,
  senderName: 'Практика', enabled: true, editable: true, source: 'saved' };
const message = (): ProviderMessage => ({ key: `praxisraum/${uid()}/${uid()}`, to: 'client@example.com', subject: 'Ваші документи', text: 'Привіт!\nПеревірка.',
  attachments: [{ filename: 'завдання.txt', content_type: 'text/plain', content: Buffer.from('Текст вправи').toString('base64') }] });
const template = await readFile(new URL('../examples/gmail-praxisraum.gs', import.meta.url), 'utf8');
function google(options: { sendThrows?: boolean; storeThrows?: boolean; quota?: number; locked?: boolean } = {}) {
  const properties = new Map<string, string>(), sent: Record<string, unknown>[] = [];
  const store = { getProperty: (name: string) => properties.get(name) ?? null,
    setProperty: (name: string, value: string) => { if (options.storeThrows && name.startsWith('mail_')) throw new Error('synthetic store failure'); properties.set(name, value); },
    deleteProperty: (name: string) => properties.delete(name), getProperties: () => Object.fromEntries(properties) };
  const ctx = createContext({ console: { log: () => { throw new Error('Script must not log patient data'); } },
    PropertiesService: { getScriptProperties: () => store },
    Session: { getEffectiveUser: () => ({ getEmail: () => address }) },
    MailApp: { getRemainingDailyQuota: () => options.quota ?? 100, sendEmail: (value: Record<string, unknown>) => { sent.push(value); if (options.sendThrows) throw new Error('synthetic ambiguous failure'); } },
    LockService: { getScriptLock: () => ({ tryLock: () => !options.locked, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (body: string) => ({ setMimeType: () => body }) },
    Utilities: { Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      computeHmacSha256Signature: (v: string, k: string) => [...createHmac('sha256', k).update(v).digest()].map(n => n > 127 ? n - 256 : n),
      computeDigest: (_: string, v: string) => [...createHash('sha256').update(v).digest()],
      base64Decode: (v: string) => [...Buffer.from(v, 'base64')],
      newBlob: (bytes: number[], mimeType: string, filename: string) => ({ bytes, mimeType, filename }) },
  });
  runInContext(template.replace('__PRAXISRAUM_CONNECTION_KEY__', key), ctx); runInContext('setupPraxisraum()', ctx);
  const handle = (body: string) => JSON.parse(ctx.doPost({ postData: { contents: body } }));
  const requests: { url: string; init?: RequestInit }[] = [];
  const transport = (async (input, init) => { requests.push({ url: String(input), init }); assert.equal(String(input), endpoint); return Response.json(handle(String(init?.body))); }) as typeof fetch;
  return { handle, transport, requests, sent, properties, options };
}
test('Gmail credentials and endpoints are constrained; generation produces independent 256-bit codes', () => {
  const first = newGmailConnectionKey(); assert.equal(validProviderCredential('gmail', first), true); assert.notEqual(first, newGmailConnectionKey());
  assert.equal(validGmailEndpoint(endpoint), true); assert.equal(validGmailAddress(address), true);
  for (const value of ['http://script.google.com/macros/s/long_enough_deployment/exec', endpoint + '?x=1', endpoint.replace('/exec','/dev'), endpoint.replace('script.google.com','evil.example'), 'https://127.0.0.1/exec']) assert.equal(validGmailEndpoint(value), false);
  assert.equal(validGmailAddress('client@example.com'), false); assert.equal(validProviderCredential('gmail','myGooglePassword'), false);
});
test('connection verification does not send mail; the script sends Unicode and the original attachment exactly once', async () => {
  const g = google(); await callGmailRelay(provider, null, g.transport); assert.equal(g.sent.length, 0);
  const input = message(), first = await callGmailRelay(provider, input, g.transport), again = await callGmailRelay(provider, input, g.transport);
  assert.deepEqual(first, again); assert.equal(g.sent.length, 1); assert.equal(g.sent[0].subject, input.subject); assert.equal(g.sent[0].body, input.text);
  const file = (g.sent[0].attachments as { bytes: number[]; filename: string }[])[0]; assert.equal(file.filename, 'завдання.txt'); assert.equal(Buffer.from(file.bytes).toString(), 'Текст вправи');
  const receipts = [...g.properties].filter(([name]) => name.startsWith('mail_'));
  assert.equal(receipts.length, 1); for (const text of receipts.flat()) { assert.equal(text.includes(input.to), false); assert.equal(text.includes(input.text), false); }
  assert.equal(JSON.stringify(g.requests).includes(key), false);
  const response = await sendViaEmailProvider(provider, input, g.transport); assert.equal((await response.json()).id, first.providerId);
});
test('forged/tampered/expired signatures, another sender and conflicting retries cannot send', async () => {
  const g = google(); const input = message(); await callGmailRelay(provider, input, g.transport); const envelope = JSON.parse(String(g.requests[0].init?.body));
  for (const patch of [{ signature: '0'.repeat(64) }, { timestamp: 1 }, { payload: envelope.payload.replace('client@example.com', 'evil@example.com') }]) assert.equal(g.handle(JSON.stringify({ ...envelope, ...patch })).ok, false);
  await assert.rejects(() => callGmailRelay({ ...provider, senderEmail: 'other@gmail.com' }, null, g.transport), /emailGmailAddressMismatch/);
  await assert.rejects(() => callGmailRelay(provider, { ...input, text: 'changed' }, g.transport), /emailGmailDeliveryUnknown/);
  assert.equal(g.sent.length, 1);
});
test('crashes, quota, locks and failed durable claims never trigger a blind retry', async () => {
  const uncertain = google({ sendThrows: true }), input = message();
  for (let i = 0; i < 2; i++) await assert.rejects(() => callGmailRelay(provider, input, uncertain.transport), /emailGmailDeliveryUnknown/);
  assert.equal(uncertain.sent.length, 1);
  const full = google({ quota: 0 }); await assert.rejects(() => callGmailRelay(provider, message(), full.transport), /emailRateLimited/); assert.equal(full.sent.length, 0);
  const noStore = google({ storeThrows: true }); await assert.rejects(() => callGmailRelay(provider, message(), noStore.transport), /emailGmailDeliveryUnknown/); assert.equal(noStore.sent.length, 0);
  const locked = google({ locked: true }); await assert.rejects(() => callGmailRelay(provider, message(), locked.transport), /emailGmailDeliveryUnknown/); assert.equal(locked.sent.length, 0);
});
test('the relay only follows a Google ContentService GET redirect and rejects arbitrary locations', async () => {
  const g = google(), seen: string[] = []; let result: unknown;
  const transport = (async (input, init) => { seen.push(String(input)); if (seen.length === 1) { result = g.handle(String(init?.body)); return new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/macros/echo?user_content_key=synthetic' } }); }
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined); assert.equal(init?.headers, undefined); return Response.json(result); }) as typeof fetch;
  await callGmailRelay(provider, message(), transport); assert.equal(seen.length, 2); assert.equal(g.sent.length, 1);
  for (const location of ['https://evil.example/steal','https://accounts.google.com/login','https://script.googleusercontent.com/other']) {
    let calls = 0; await assert.rejects(() => callGmailRelay(provider, null, (async () => { calls++; return new Response(null, { status: 302, headers: { location } }); }) as typeof fetch), /emailGmailConnectionInvalid/); assert.equal(calls, 1);
  }
});
test('authenticated Gmail setup checks without sending, stores no Google password and returns no secret', async () => {
  const owner = uid(), env = { APP_ORIGIN: 'https://app.example.com', EMAIL_OWNER_USER_ID: owner, SUPABASE_URL: 'https://cloud.example', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'server' }, g = google();
  let stored: unknown = null; const writes: Record<string, unknown>[] = [];
  const transport = (async (input, init) => {
    const url = String(input); if (url.endsWith('/auth/v1/user')) return Response.json({ id: owner, email: 'owner@example.com', email_confirmed_at: new Date().toISOString() });
    if (url.endsWith('get_email_provider_settings')) return Response.json(stored);
    if (url.endsWith('save_email_provider_settings')) { const v = JSON.parse(String(init?.body)); writes.push(v); stored = { apiKey: v.p_key, senderEmail: v.p_email, senderName: v.p_name, enabled: v.p_enabled, provider: v.p_provider, endpoint: v.p_endpoint }; return new Response(null, { status: 204 }); }
    return g.transport(input, init);
  }) as typeof fetch;
  const handler = createEmailHandler(env, transport), req = (data: object) => new Request('https://cloud.example/functions/v1/send-client-email', { method: 'POST', headers: { origin: env.APP_ORIGIN, authorization: 'Bearer synthetic' }, body: JSON.stringify(data) });
  const response = await handler(req({ action: 'save', provider: 'gmail', endpoint, senderEmail: address, senderName: 'Praxis', apiKey: key, enabled: true }));
  assert.equal(response.status, 200); const status = await response.json(); assert.equal(status.provider, 'gmail'); assert.equal(status.ready, true); assert.equal(JSON.stringify(status).includes(key), false); assert.equal(g.sent.length, 0); assert.equal(writes.length, 1);
  const mismatch = await handler(req({ action: 'save', provider: 'gmail', endpoint, senderEmail: 'other@gmail.com', senderName: 'Praxis', apiKey: key, enabled: true }));
  assert.equal(mismatch.status, 502); assert.equal((await mismatch.json()).error, 'emailGmailAddressMismatch'); assert.equal(writes.length, 1);
  const test = await handler(req({ action: 'test', language: 'uk', requestId: uid(), to: 'client@example.com' })); assert.equal(test.status, 200); assert.equal(g.sent[0].to, 'owner@example.com');
  const document = message(); const attachment = document.attachments![0];
  const delivered = await handler(req({ requestId: uid(), to: document.to, subject: document.subject, text: document.text,
    attachment: { filename: attachment.filename, content: attachment.content, contentType: attachment.content_type } }));
  assert.equal(delivered.status, 200); assert.equal(g.sent[1].to, 'client@example.com');
  assert.equal((await handler(req({ action: 'save', provider: 'gmail', endpoint: 'https://evil.example/', senderEmail: address, senderName: 'Praxis', apiKey: key, enabled: true }))).status, 400);
});
