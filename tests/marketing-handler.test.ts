import test from "node:test";
import assert from "node:assert/strict";
import { createMarketingHandler } from "../supabase/functions/send-marketing/handler";
import { uid } from "../src/lib/types";
const owner = uid(),
  env = {
    APP_ORIGIN: "https://practice.example",
    MARKETING_OWNER_USER_ID: owner,
    SUPABASE_URL: "https://cloud.example",
    SUPABASE_ANON_KEY: "public",
    SUPABASE_SERVICE_ROLE_KEY: "backend-only",
    TELEGRAM_BOT_TOKEN: "fake",
    EMAIL_FROM: "practice@example.com",
    RESEND_API_KEY: "fake",
  };
const payload = () => ({
  id: uid(),
  newsletterId: uid(),
  messageId: uid(),
  consentId: uid(),
  tokenHash: "a".repeat(64),
  grantedAt: new Date().toISOString(),
  channel: "email",
  to: "client@example.com",
  subject: "Information",
  text: "A neutral message",
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function harness(
  provider: (
    input: string,
    init?: RequestInit,
  ) => Promise<Response> = async () => json({ id: "provider-1" }),
  receipt = true,
  settings: Record<string, unknown> | null = null,
) {
  let calls = 0;
  const claims = new Set<string>(),
    rpcBodies: Record<string, unknown>[] = [],
    bodies: Record<string, unknown>[] = [];
  const handler = createMarketingHandler(env, (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return json({ id: owner });
    if (url.includes("marketing_delivery_receipts?")) return json([]);
    if (url.endsWith('/rpc/get_email_provider_settings')) return json(settings);
    if (url.includes("/rpc/")) {
      const body = JSON.parse(String(init?.body));
      rpcBodies.push(body);
      if (url.endsWith("begin_marketing_delivery")) {
        if (claims.has(body.p_id))
          return json({ claimed: false, status: "sending" });
        claims.add(body.p_id);
        return json({ claimed: true, status: "sending" });
      }
      return json(receipt);
    }
    calls++;
    if (typeof init?.body === "string") bodies.push(JSON.parse(init.body));
    return provider(url, init);
  }) as typeof fetch);
  return {
    handler,
    get calls() {
      return calls;
    },
    rpcBodies,
    bodies,
  };
}
const request = (body: unknown, origin = env.APP_ORIGIN) =>
  new Request("https://cloud.example/functions/v1/send-marketing", {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
test("handler checks origin/auth, validates private destinations and rejects unsafe bodies before a provider request", async () => {
  const h = harness();
  assert.equal(
    (await h.handler(request(payload(), "https://evil.example"))).status,
    403,
  );
  assert.equal(
    (
      await h.handler(
        request({ ...payload(), channel: "telegram", to: "-1001234" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await h.handler(request({ ...payload(), subject: "Hello\r\nBcc: all" })))
      .status,
    400,
  );
  assert.equal(
    (
      await h.handler(
        request({
          ...payload(),
          image: { mimeType: "image/webp", content: btoa("not an image") },
        }),
      )
    ).status,
    400,
  );
  assert.equal(h.calls, 0);
});
test("successful email is individually addressed, claimed first and recorded only after provider acceptance", async () => {
  const h = harness(),
    p = payload(),
    r = await h.handler(request(p)),
    result = await r.json();
  assert.equal(result.status, "sent");
  assert.equal(result.providerId, "provider-1");
  assert.deepEqual(h.bodies[0].to, [p.to]);
  assert.equal(h.rpcBodies[0].p_target_hash?.toString().length, 64);
  assert.ok(!JSON.stringify(h.rpcBodies).includes(p.to));
  assert.ok(!JSON.stringify(h.rpcBodies).includes(p.text));
  assert.equal(h.rpcBodies[1].p_status, "sent");
  await h.handler(request(p));
  assert.equal(h.calls, 1);
});
test("Telegram acceptance requires matching private chat identity and a valid provider message id", async () => {
  for (const type of ["private", "group"]) {
    const h = harness(async () =>
      json({
        ok: true,
        result: { message_id: 7, chat: { id: 123456789, type } },
      }),
    );
    const r = await (
      await h.handler(
        request({ ...payload(), channel: "telegram", to: "123456789" }),
      )
    ).json();
    assert.equal(r.status, type === "private" ? "sent" : "unknown");
    assert.equal(
      (h.bodies[0].link_preview_options as { is_disabled: boolean })
        .is_disabled,
      true,
    );
  }
});
test("timeouts, provider 5xx and receipt-update loss stay uncertain; explicit rejection/limits are failures", async () => {
  for (const [status, expected] of [
    [500, "unknown"],
    [429, "failed"],
    [400, "failed"],
  ] as const) {
    const h = harness(async () => json({}, status));
    assert.equal(
      (await (await h.handler(request(payload()))).json()).status,
      expected,
    );
  }
  const lost = harness(async () => {
    throw new Error("network");
  });
  assert.equal(
    (await (await lost.handler(request(payload()))).json()).status,
    "unknown",
  );
  const db = harness(undefined, false);
  assert.equal(
    (await (await db.handler(request(payload()))).json()).status,
    "unknown",
  );
});

test("a caller cannot impersonate the configured owner or use an unregistered backend", async () => {
  const missing = createMarketingHandler(
    { ...env, MARKETING_OWNER_USER_ID: undefined },
    async () => {
      throw new Error("must not request");
    },
  );
  assert.equal((await missing(request(payload()))).status, 501);
  const stranger = createMarketingHandler(env, async () => json({ id: uid() }));
  assert.equal((await stranger(request(payload()))).status, 401);
});

test('Telegram marketing images use a private WebP attachment with a neutral filename and caption',async()=>{
 const h=harness(async(url,init)=>{assert.match(url,/sendDocument$/);assert.ok(init?.body instanceof FormData);const form=init.body as FormData;assert.equal(form.get('caption'),'A neutral message');const image=form.get('document') as File;assert.equal(image.name,'marketing.webp');assert.equal(image.type,'image/webp');return json({ok:true,result:{message_id:17,chat:{id:123456789,type:'private'}}});});
 const p={...payload(),channel:'telegram',to:'123456789',image:{mimeType:'image/webp',content:btoa('RIFF0000WEBP0000')}};assert.equal((await(await h.handler(request(p))).json()).status,'sent');
});

test('marketing uses the saved sender/key and a paused provider blocks email before claiming a delivery', async () => {
  for (const enabled of [true, false]) {
    const h = harness(async (_url, init) => {
      assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer re_saved_synthetic');
      assert.equal(JSON.parse(String(init!.body)).from, 'Нова практика <new@example.com>');
      return json({ id: 'synthetic-saved-receipt' });
    }, true, { apiKey: 're_saved_synthetic', senderEmail: 'new@example.com', senderName: 'Нова практика', enabled });
    const capabilities = await (await h.handler(request({ action: 'capabilities' }))).json();
    assert.equal(capabilities.email, enabled); assert.equal(capabilities.telegram, true);
    assert.equal(JSON.stringify(capabilities).includes('re_saved_synthetic'), false);
    const response = await h.handler(request(payload())); assert.equal(response.status, enabled ? 200 : 501);
    assert.equal(h.calls, enabled ? 1 : 0); assert.equal(h.rpcBodies.length, enabled ? 2 : 0);
  }
});
