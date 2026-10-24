import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailHandler, type EmailEnvironment } from '../supabase/functions/send-client-email/handler';
import { loadEmailProvider } from '../supabase/functions/_shared/emailProvider';
import { overrideCloud } from '../src/lib/cloud';
import { getEmailStatus, readEmailStatus, saveEmailSettings, sendEmailTest } from '../src/lib/emailSettings';
import { uid } from '../src/lib/types';

const owner = uid(), secret = 're_test_only_not_a_real_provider_secret', env: EmailEnvironment = {
  APP_ORIGIN: 'https://app.example.com', EMAIL_OWNER_USER_ID: owner, SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'public-only', SUPABASE_SERVICE_ROLE_KEY: 'server-only',
};
const req = (body: unknown, origin = env.APP_ORIGIN, authorization = 'Bearer synthetic') => new Request('https://test.supabase.co/functions/v1/send-client-email', {
  method: 'POST', headers: { origin: origin!, authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const saved = () => ({ apiKey: secret, senderEmail: 'praxis@example.com', senderName: 'Praxis', enabled: true, updatedAt: new Date().toISOString() });
function harness(options: { stored?: ReturnType<typeof saved> | null; foreign?: boolean; confirmed?: boolean; providerStatus?: number; rpcStatus?: number } = {}) {
  let stored = options.stored ?? null; const writes: Record<string, unknown>[] = [], mails: Record<string, unknown>[] = [];
  const transport = (async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: options.foreign ? uid() : owner, email: 'owner@example.com', email_confirmed_at: options.confirmed === false ? null : new Date().toISOString() });
    if (url.includes('/rpc/')) {
      assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer server-only');
      if (options.rpcStatus) return new Response('', { status: options.rpcStatus });
      if (url.endsWith('get_email_provider_settings')) return Response.json(stored);
      assert.ok(url.endsWith('save_email_provider_settings')); const input = JSON.parse(init!.body as string); writes.push(input);
      assert.equal(input.p_owner, owner);
      stored = { ...saved(), apiKey: input.p_key ?? stored?.apiKey, senderEmail: input.p_email, senderName: input.p_name, enabled: input.p_enabled };
      return new Response(null, { status: 204 });
    }
    assert.equal(url, 'https://api.resend.com/emails'); assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
    mails.push(JSON.parse(init!.body as string));
    return options.providerStatus ? Response.json({ name: 'validation_error', message: 'private recipient details must not leak' }, { status: options.providerStatus }) : Response.json({ id: 'synthetic-receipt' });
  }) as typeof fetch;
  return { handler: createEmailHandler(env, transport), transport, writes, mails };
}
test('status and configuration reject unauthenticated, foreign and cross-origin requests before accessing secrets', async () => {
  const h = harness({ foreign: true });
  for (const action of ['status', 'save', 'test']) {
    assert.equal((await h.handler(req({ action }, 'https://evil.example'))).status, 403);
    assert.equal((await h.handler(req({ action }, undefined, ''))).status, 401);
    assert.equal((await h.handler(req({ action }))).status, 401);
  }
  assert.equal(h.writes.length, 0); assert.equal(h.mails.length, 0);
});
test('saved settings survive independent requests and never expose provider credentials', async () => {
  const h = harness();
  const empty = await (await h.handler(req({ action: 'status' }))).json(); assert.equal(empty.ready, false); assert.equal(empty.editable, true);
  const response = await h.handler(req({ action: 'save', senderEmail: 'praxis@example.com', senderName: 'Praxis', apiKey: secret, enabled: true }));
  assert.equal(response.status, 200);
  for (const result of [await response.json(), await (await h.handler(req({ action: 'status' }))).json()]) {
    assert.equal(result.ready, true); assert.equal(result.senderEmail, 'praxis@example.com'); assert.equal(result.keyStored, true);
    assert.equal(JSON.stringify(result).includes(secret), false); assert.equal(result.apiKey, undefined);
  }
  await h.handler(req({ action: 'save', senderEmail: 'neu@example.com', senderName: 'Нова практика', apiKey: '', enabled: false }));
  assert.equal(h.writes[1].p_key, null); const paused = await (await h.handler(req({ action: 'status' }))).json();
  assert.equal(paused.ready, false); assert.equal(paused.enabled, false); assert.equal(paused.keyStored, true);
  const blocked = await h.handler(req({ action: 'test', language: 'de', requestId: uid() })); assert.equal(blocked.status, 501); assert.equal(h.mails.length, 0);
});
test('invalid sender, header injection, invalid key and an absent first key cannot be saved', async () => {
  const h = harness(); const input = { action: 'save', senderEmail: 'praxis@example.com', senderName: 'Praxis', apiKey: secret, enabled: true };
  for (const patch of [{ senderEmail: 'bad' }, { senderName: 'A\r\nBcc:someone' }, { senderName: '<script>' }, { apiKey: 'public-key' }, { apiKey: '' }, { enabled: 'yes' }]) {
    assert.equal((await h.handler(req({ ...input, ...patch }))).status, 400);
  }
  assert.equal(h.writes.length, 0); assert.equal(h.mails.length, 0);
});
test('a test email goes only to the verified account, never a supplied client address, with no attachment', async () => {
  const h = harness({ stored: saved() });
  const id = uid(); for (const language of ['de', 'uk']) {
    const response = await h.handler(req({ action: 'test', language, requestId: id, to: 'client@example.com', attachment: 'ignored', notes: 'ignored' }));
    assert.equal(response.status, 200); assert.equal((await response.json()).providerId, 'synthetic-receipt');
  }
  assert.deepEqual(h.mails[0].to, ['owner@example.com']); assert.equal(h.mails[0].attachments, undefined);
  assert.equal(JSON.stringify(h.mails).includes('client@example.com'), false); assert.equal(JSON.stringify(h.mails).includes('ignored'), false);
  const unconfirmed = harness({ stored: saved(), confirmed: false }); assert.equal((await unconfirmed.handler(req({ action: 'test', language: 'de', requestId: uid() }))).status, 400);
  assert.equal(unconfirmed.mails.length, 0);
});
test('provider errors are actionable without leaking addresses or upstream response text', async () => {
  for (const [status, code] of [[401, 'emailProviderKeyInvalid'], [403, 'emailSenderNotVerified'], [429, 'emailRateLimited'], [500, 'emailSendError']] as const) {
    const h = harness({ stored: saved(), providerStatus: status }); const result = await h.handler(req({ action: 'test', language: 'de', requestId: uid() }));
    assert.deepEqual(await result.json(), { error: code });
  }
});
test('a store outage fails closed, while a legacy installation without the new migration still works', async () => {
  const legacy = { ...env, EMAIL_FROM: 'Alt <alt@example.com>', RESEND_API_KEY: 'legacy-server-secret' };
  const paused = harness({ stored: { ...saved(), enabled: false } }); const p = await loadEmailProvider(legacy, owner, paused.transport);
  assert.equal(p.apiKey, undefined); assert.equal(p.from, undefined); assert.equal(p.source, 'saved');
  await assert.rejects(() => loadEmailProvider(legacy, owner, harness({ rpcStatus: 503 }).transport), /emailConnectionError/);
  const old = await loadEmailProvider(legacy, owner, harness({ rpcStatus: 404 }).transport);
  assert.equal(old.apiKey, legacy.RESEND_API_KEY); assert.equal(old.editable, false);
});
test('frontend projection drops unexpected secret fields and validates server responses', async () => {
  const safe = { ready: true, enabled: true, editable: true, keyStored: true, senderEmail: 'praxis@example.com', senderName: 'Praxis', accountEmail: 'owner@example.com', source: 'saved' as const };
  assert.deepEqual(readEmailStatus({ ...safe, apiKey: secret }), safe); assert.throws(() => readEmailStatus({ ...safe, ready: 'yes' }), /emailConnectionError/);
  const sent: Record<string, unknown>[] = [];
  overrideCloud({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, functions: { invoke: async (_: string, { body }: { body: Record<string, unknown> }) => { sent.push(body); return { data: body.action === 'test' ? { providerId: 'synthetic', acceptedAt: new Date().toISOString() } : safe }; } } });
  assert.deepEqual(await getEmailStatus(), safe); await saveEmailSettings({ senderEmail: safe.senderEmail, senderName: safe.senderName, enabled: true, apiKey: secret }); await sendEmailTest('uk', uid());
  assert.deepEqual(sent.map(v => v.action), ['status', 'save', 'test']); assert.equal(sent[2].to, undefined);
});
