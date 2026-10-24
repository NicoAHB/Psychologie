import { loadEmailProvider } from '../_shared/emailProvider.ts';
import { sendViaEmailProvider } from '../_shared/gmailRelay.ts';
/** Only explicit, consented marketing deliveries. Never log requests, contacts,
 * tokens, messages, images or provider responses. No access to the patient vault. */
export interface MarketingEnvironment {
  APP_ORIGIN?: string;
  MARKETING_OWNER_USER_ID?: string;
  EMAIL_OWNER_USER_ID?: string;
  TELEGRAM_OWNER_USER_ID?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
type Status = "sending" | "sent" | "failed" | "unknown";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const chat = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[1-9]\d{0,15}$/.test(value) &&
  Number.isSafeInteger(Number(value));
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
async function readJson(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 3 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const value of chunks) {
    bytes.set(value, at);
    at += value.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createMarketingHandler(
  env: MarketingEnvironment,
  request: typeof fetch = fetch,
) {
  return async (req: Request): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    const reply = (status: number, body: object) =>
      new Response(JSON.stringify(body), { status, headers });
    if (!env.APP_ORIGIN || req.headers.get("origin") !== env.APP_ORIGIN)
      return reply(403, { error: "authError" });
    headers["Access-Control-Allow-Origin"] = env.APP_ORIGIN;
    headers["Access-Control-Allow-Headers"] =
      "authorization, x-client-info, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply(405, { error: "invalidRequest" });
    const owner = env.MARKETING_OWNER_USER_ID;
    if (
      !owner ||
      !UUID.test(owner) ||
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY ||
      !env.SUPABASE_SERVICE_ROLE_KEY
    )
      return reply(501, { error: "marketingSetupNeeded" });
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      return reply(401, { error: "authError" });
    const rpc = async (name: string, body: object) => {
      const response = await request(
        `${env.SUPABASE_URL}/rest/v1/rpc/${name}`,
        {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error("receipt");
      return response.json();
    };
    try {
      const auth = await request(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: authorization,
          apikey: env.SUPABASE_ANON_KEY,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!auth.ok || (await auth.json()).id !== owner)
        return reply(401, { error: "authError" });
      let data;
      try {
        data = await readJson(req);
      } catch {
        return reply(400, { error: "invalidRequest" });
      }
      if (data?.action === "capabilities") {
        let emailReady = false;
        try { const provider = await loadEmailProvider(env, owner, request); emailReady = !!(provider.apiKey && provider.from); } catch { /* Email unavailable; Telegram remains independent. */ }
        const schema = await request(
          `${env.SUPABASE_URL}/rest/v1/marketing_delivery_receipts?select=id&limit=0`,
          {
            headers: {
              Authorization: authorization,
              apikey: env.SUPABASE_ANON_KEY,
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        return schema.ok
          ? reply(200, {
              ready: true,
              email: emailReady,
              telegram: !!env.TELEGRAM_BOT_TOKEN,
            })
          : reply(501, { error: "marketingSetupNeeded" });
      }
      const {
        id,
        newsletterId,
        messageId,
        channel,
        consentId,
        grantedAt,
        tokenHash,
        to,
        subject,
        text,
        image,
      } = data ?? {};
      if (
        ![id, newsletterId, messageId, consentId].every(
          (value) => typeof value === "string" && UUID.test(value),
        ) ||
        typeof tokenHash !== "string" ||
        !/^[0-9a-f]{64}$/.test(tokenHash) ||
        !["email", "telegram"].includes(channel)
      )
        return reply(400, { error: "invalidRequest" });
      if (
        typeof grantedAt !== "string" ||
        !Number.isFinite(Date.parse(grantedAt)) ||
        Date.parse(grantedAt) > Date.now() + 300000
      )
        return reply(400, { error: "invalidRequest" });
      if (
        !(channel === "email" ? email(to) : chat(to)) ||
        typeof text !== "string" ||
        !text.trim() ||
        text.length > (channel === "email" ? 12000 : image ? 1024 : 4096) ||
        typeof subject !== "string" ||
        !subject.trim() ||
        subject.length > 180 ||
        /[\r\n]/.test(subject)
      )
        return reply(400, { error: "invalidRequest" });
      let emailProvider;
      if (channel === 'email') {
        try { emailProvider = await loadEmailProvider(env, owner, request); } catch { return reply(501, { error: 'marketingSetupNeeded' }); }
      }
      if (
        (channel === "email" && (!emailProvider?.apiKey || !emailProvider?.from)) ||
        (channel === "telegram" && !env.TELEGRAM_BOT_TOKEN)
      )
        return reply(501, { error: "marketingSetupNeeded" });
      let imageBytes: Uint8Array<ArrayBuffer> | undefined;
      if (image !== undefined) {
        if (
          !image ||
          typeof image.content !== "string" ||
          image.mimeType !== "image/webp" ||
          image.content.length > 2800000 ||
          image.content.length % 4 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(image.content)
        )
          return reply(400, { error: "invalidRequest" });
        const raw = atob(image.content);
        if (
          raw.length > 2 * 1024 * 1024 ||
          !raw.startsWith("RIFF") ||
          raw.slice(8, 12) !== "WEBP"
        )
          return reply(400, { error: "invalidRequest" });
        imageBytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      }
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.SUPABASE_SERVICE_ROLE_KEY),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const targetHash = hex(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(
            `marketing-destination:v1:${channel}:${channel === "email" ? to.toLowerCase() : to}`,
          ),
        ),
      );
      let claim;
      try {
        claim = await rpc("begin_marketing_delivery", {
          p_owner: owner,
          p_id: id,
          p_channel: channel,
          p_consent: consentId,
          p_token_hash: tokenHash,
          p_target_hash: targetHash,
          p_newsletter: newsletterId,
          p_message: messageId,
          p_granted_at: grantedAt,
        });
      } catch {
        return reply(501, { error: "marketingSetupNeeded" });
      }
      if (claim?.claimed !== true)
        return reply(200, {
          status: claim?.status || "unknown",
          errorCode: claim?.errorCode,
          acceptedAt: claim?.acceptedAt,
          providerId: claim?.providerId,
          messageId: claim?.messageId || messageId,
          channel: claim?.channel || channel,
        });
      let status: Status = "unknown",
        providerId: string | undefined,
        errorCode = "marketingDeliveryUnknown";
      try {
        let response: Response;
        if (channel === "email") {
          response = await sendViaEmailProvider(emailProvider!, {
            key: `marketing/${owner}/${id}`, to, subject, text,
            ...(imageBytes && { attachments: [{ filename: 'marketing.webp', content: image.content, content_type: 'image/webp' }] }),
          }, request);
        } else if (imageBytes) {
          const form = new FormData();
          form.set("chat_id", to);
          form.set("caption", text);
          form.set(
            "document",
            new Blob([imageBytes], { type: "image/webp" }),
            "marketing.webp",
          );
          response = await request(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
            { method: "POST", body: form, signal: AbortSignal.timeout(25000) },
          );
        } else {
          response = await request(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: to,
                text,
                link_preview_options: { is_disabled: true },
              }),
              signal: AbortSignal.timeout(25000),
            },
          );
        }
        if (response.status === 429) {
          status = "failed";
          errorCode = "marketingRateLimited";
        } else if (response.status >= 400 && response.status < 500) {
          status = "failed";
          errorCode = "marketingSendFailed";
        } else if (response.ok) {
          const result = await response.json();
          if (
            channel === "email" &&
            typeof result?.id === "string" &&
            result.id &&
            result.id.length <= 200
          ) {
            providerId = result.id;
            status = "sent";
          }
          if (
            channel === "telegram" &&
            result?.ok === true &&
            Number.isSafeInteger(result.result?.message_id) &&
            result.result.message_id > 0 &&
            String(result.result.chat?.id) === to &&
            result.result.chat.type === "private"
          ) {
            providerId = String(result.result.message_id);
            status = "sent";
          }
        }
      } catch {
        /* A timeout can mean accepted: retain unknown and never retry automatically. */
      }
      imageBytes?.fill(0);
      try {
        if (
          (await rpc("finish_marketing_delivery", {
            p_owner: owner,
            p_id: id,
            p_status: status,
            p_provider: providerId ?? null,
            p_error: status === "sent" ? null : errorCode,
          })) !== true
        )
          return reply(200, {
            status: "unknown",
            errorCode: "marketingDeliveryUnknown",
            messageId,
          });
      } catch {
        return reply(200, {
          status: "unknown",
          errorCode: "marketingDeliveryUnknown",
          messageId,
        });
      }
      return reply(200, {
        status,
        providerId,
        messageId,
        channel,
        acceptedAt: status === "sent" ? new Date().toISOString() : undefined,
        errorCode: status === "sent" ? undefined : errorCode,
      });
    } catch {
      return reply(502, { error: "marketingDeliveryUnknown" });
    }
  };
}
