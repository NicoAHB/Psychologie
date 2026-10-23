import { cloudConfigured, getCloud } from "./cloud";
import { metaGet, updateMetaSet } from "./db";
import { toBase64 } from "./crypto";
import {
  marketingConsent,
  marketingChannels,
  clientMarketingChannels,
  marketingDestination,
  marketingRecipientId,
  messageForLanguage,
  newsletterStatus,
  validateMarketingMessage,
} from "./marketing";
import { translate } from "./i18n";
import type { VaultController } from "./useVault";
import {
  uid,
  type MarketingChannel,
  type MarketingChannelSelection,
  type NewsletterMessage,
  type NewsletterRecipient,
} from "./types";

const env: Partial<Record<string, string>> = import.meta.env ?? {};
const guestSdk = cloudConfigured ? () => import("@supabase/supabase-js") : null;
export interface MarketingCapabilities {
  ready: boolean;
  email: boolean;
  telegram: boolean;
}
export interface MarketingReceipt {
  status: "sending" | "sent" | "failed" | "unknown";
  providerId?: string;
  acceptedAt?: string;
  errorCode?: string;
  messageId?: string;
  channel?: MarketingChannel;
}
export interface NewsletterInput {
  channel: MarketingChannelSelection;
  message: NewsletterMessage;
  clientIds: string[];
  image?: Blob;
  id?: string;
  campaignId?: string;
  occurrenceOn?: string;
}
const queueKey = (vaultId: string) => `marketing-revocations:${vaultId}`;
export async function queueMarketingRevocations(
  vaultId: string,
  ids: string[],
) {
  if (!ids.length) return;
  await updateMetaSet(queueKey(vaultId), ids);
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("praxisraum-marketing-revocations"));
}
export async function flushMarketingRevocations(vaultId: string) {
  const ids = (await metaGet<string[]>(queueKey(vaultId))) ?? [];
  if (!ids.length) return;
  const cloud = await getCloud();
  if (!cloud) return;
  for (const id of ids) {
    const { error } = await cloud.rpc("revoke_marketing_consent", { p_id: id });
    if (error) throw new Error("marketingSetupNeeded");
    await updateMetaSet(queueKey(vaultId), [], [id]);
  }
}
async function invoke(
  body: object,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!cloudConfigured || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)
    throw new Error("marketingSetupNeeded");
  const cloud = await getCloud();
  const session = cloud && (await cloud.auth.getSession()).data.session;
  if (!session) throw new Error("authError");
  const response = await fetch(
    `${env.VITE_SUPABASE_URL}/functions/v1/send-marketing`,
    {
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "authError"
        : response.status === 404 || response.status === 501
          ? "marketingSetupNeeded"
          : typeof data.error === "string"
            ? data.error
            : "marketingDeliveryUnknown",
    );
  return data;
}
export async function loadMarketingCapabilities(
  signal?: AbortSignal,
): Promise<MarketingCapabilities> {
  const data = await invoke({ action: "capabilities" }, signal);
  return {
    ready: data.ready === true,
    email: data.email === true,
    telegram: data.telegram === true,
  };
}
export function parseMarketingUnsubscribe(hash: string) {
  const match =
    /^#marketing-unsubscribe=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})\.(de|uk)$/i.exec(
      hash,
    );
  return match
    ? {
        id: match[1],
        token: match[2],
        language: match[3].toLowerCase() as "de" | "uk",
      }
    : null;
}
export async function unsubscribeMarketing(id: string, token: string) {
  if (!guestSdk || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)
    throw new Error("marketingSetupNeeded");
  const { createClient } = await guestSdk();
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        storageKey: "praxisraum-marketing-guest",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            referrerPolicy: "no-referrer",
          }),
      },
    },
  );
  const { data, error } = await client.rpc("unsubscribe_marketing", {
    p_id: id,
    p_token: token,
  });
  if (error || data !== true) throw new Error("marketingUnsubscribeInvalid");
}
const tokenHash = async (token: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
function assertReceipt(data: Record<string, unknown>): MarketingReceipt {
  const status = data.status;
  if (!["sending", "sent", "failed", "unknown"].includes(String(status)))
    throw new Error("marketingDeliveryUnknown");
  if (
    status === "sent" &&
    (typeof data.providerId !== "string" ||
      !data.providerId ||
      typeof data.acceptedAt !== "string" ||
      !Number.isFinite(Date.parse(data.acceptedAt)))
  )
    throw new Error("marketingDeliveryUnknown");
  return {
    status: status as MarketingReceipt["status"],
    providerId:
      typeof data.providerId === "string" ? data.providerId : undefined,
    acceptedAt:
      typeof data.acceptedAt === "string" ? data.acceptedAt : undefined,
    errorCode: typeof data.errorCode === "string" ? data.errorCode : undefined,
    messageId: typeof data.messageId === "string" ? data.messageId : undefined,
    channel:
      data.channel === "email" || data.channel === "telegram"
        ? data.channel
        : undefined,
  };
}
/** Called by the global marketing hook, so navigating to the archive does not
 * cancel a batch. Locking aborts the request; a durable sending marker remains. */
export async function dispatchNewsletter(
  getVault: () => VaultController,
  input: NewsletterInput,
  signal: AbortSignal,
) {
  const vault = getVault();
  if (vault.demo) throw new Error("marketingDemo");
  const initial = vault.getData();
  if (!initial || signal.aborted) throw new Error("locked");
  if (!marketingChannels(input.channel).length)
    throw new Error("marketingChooseChannel");
  validateMarketingMessage(input.message, input.channel);
  const ids = [...new Set(input.clientIds)];
  if (!ids.length) throw new Error("required");
  for (const id of ids) {
    const client = initial.clients.find((c) => c.id === id);
    if (!client || !clientMarketingChannels(client, input.channel).length)
      throw new Error("marketingConsentMissing");
    messageForLanguage(input.message, client.language);
  }
  const caps = await loadMarketingCapabilities(signal);
  const usedChannels = new Set(
    ids.flatMap((id) =>
      clientMarketingChannels(
        initial.clients.find((c) => c.id === id)!,
        input.channel,
      ),
    ),
  );
  if (!caps.ready || [...usedChannels].some((channel) => !caps[channel]))
    throw new Error("marketingSetupNeeded");
  if (vault.envelope) await flushMarketingRevocations(vault.envelope.vaultId);
  const message = structuredClone(input.message),
    newsletterId = input.id ?? uid(),
    createdAt = new Date().toISOString();
  if (input.image) {
    if (input.image.type !== "image/webp" || input.image.size > 2 * 1024 * 1024)
      throw new Error("invalidImage");
    validateMarketingMessage(
      {
        ...message,
        image: {
          blobId: "",
          fileName: "marketing.webp",
          mimeType: "image/webp",
          size: input.image.size,
        },
      },
      input.channel,
    );
    const bytes = new Uint8Array(await input.image.arrayBuffer());
    try {
      if (signal.aborted) return;
      message.image = {
        blobId: await vault.addFile(bytes),
        fileName: "marketing.webp",
        mimeType: "image/webp",
        size: bytes.length,
      };
    } finally {
      bytes.fill(0);
    }
  }
  validateMarketingMessage(message, input.channel);
  const recipients: NewsletterRecipient[] = [];
  for (const clientId of ids) {
    const client = initial.clients.find((c) => c.id === clientId)!;
    for (const channel of clientMarketingChannels(client, input.channel)) {
      const existing = initial.newsletters.find((n) => n.id === newsletterId);
      recipients.push({
        id: await marketingRecipientId(
          existing,
          newsletterId,
          clientId,
          channel,
        ),
        clientId,
        consentId: marketingConsent(client, channel)!.id,
        messageId: message.id,
        channel,
        language: client.language,
        status: "pending",
      });
    }
  }
  if (signal.aborted) return;
  let image: { content: string; mimeType: string } | undefined;
  if (message.image) {
    const blob = await vault.file(message.image.blobId, "image/webp"),
      bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      image = { content: toBase64(bytes), mimeType: "image/webp" };
    } finally {
      bytes.fill(0);
    }
  }
  await vault.update((data) => {
    data.settings.marketingUsed = true;
    let entry = data.newsletters.find((n) => n.id === newsletterId);
    if (!entry) {
      entry = {
        id: newsletterId,
        createdAt,
        channel: input.channel,
        campaignId: input.campaignId,
        occurrenceOn: input.occurrenceOn,
        messages: [],
        recipients: [],
        recipientCount: 0,
        status: "sending",
      };
      data.newsletters.push(entry);
    }
    if (!entry.messages.some((m) => m.id === message.id))
      entry.messages.push(message);
    const added = recipients.filter(
      (r) => !entry!.recipients.some((old) => old.id === r.id),
    );
    const knownClients = new Set(entry.recipients.map((r) => r.clientId));
    entry.recipients.push(...added);
    entry.recipientCount += new Set(
      added.filter((r) => !knownClients.has(r.clientId)).map((r) => r.clientId),
    ).size;
    entry.status = newsletterStatus(entry);
  });
  const update = async (
    id: string,
    result: MarketingReceipt | { status: "sending"; requestedAt: string },
  ) => {
    if (signal.aborted || !getVault().getData()) return;
    await getVault().update((data) => {
      const n = data.newsletters.find((n) => n.id === newsletterId),
        r = n?.recipients.find((r) => r.id === id);
      if (!n || !r || r.status === "sent") return;
      for (const [key, value] of Object.entries(result))
        if (value !== undefined) Object.assign(r, { [key]: value });
      if (result.status === "sent") delete r.errorCode;
      n.status = newsletterStatus(n);
    });
  };
  for (const recipient of recipients) {
    if (signal.aborted) return;
    const current = getVault().getData(),
      stored = current?.newsletters
        .find((n) => n.id === newsletterId)
        ?.recipients.find((r) => r.id === recipient.id);
    if (
      input.campaignId &&
      !current?.marketingCampaigns.some(
        (c) => c.id === input.campaignId && c.isActive,
      )
    ) {
      if (current)
        await getVault().update((data) => {
          const n = data.newsletters.find((n) => n.id === newsletterId);
          if (n) {
            for (const r of n.recipients)
              if (r.status === "pending") {
                r.status = "failed";
                r.errorCode = "marketingCampaignStopped";
              }
            n.status = newsletterStatus(n);
          }
        });
      return;
    }
    if (!stored || stored.status !== "pending") continue;
    if (input.campaignId) {
      const campaign = current?.marketingCampaigns.find(
        (c) => c.id === input.campaignId,
      );
      if (
        campaign &&
        !marketingChannels(campaign.channel).includes(recipient.channel)
      ) {
        await update(recipient.id, {
          status: "failed",
          errorCode: "marketingCampaignStopped",
        });
        continue;
      }
    }
    const client = current?.clients.find((c) => c.id === recipient.clientId),
      consent = client && marketingConsent(client, recipient.channel);
    if (!client || !consent || consent.id !== recipient.consentId) {
      await update(recipient.id, {
        status: "failed",
        errorCode: "marketingConsentMissing",
      });
      continue;
    }
    const content = messageForLanguage(message, recipient.language);
    const base = new URL(import.meta.env.BASE_URL, location.origin).href;
    const link = `${base}#marketing-unsubscribe=${consent.id}.${consent.token}.${recipient.language}`;
    const text = `${content.text}\n\n${translate(recipient.language, "marketingUnsubscribeFooter")}\n${link}`;
    await update(recipient.id, {
      status: "sending",
      requestedAt: new Date().toISOString(),
    });
    if (signal.aborted) return;
    try {
      await update(
        recipient.id,
        assertReceipt(
          await invoke(
            {
              id: recipient.id,
              newsletterId,
              messageId: message.id,
              channel: recipient.channel,
              consentId: consent.id,
              grantedAt: consent.grantedAt,
              tokenHash: await tokenHash(consent.token),
              to: marketingDestination(client, recipient.channel),
              subject: content.subject,
              text,
              image,
            },
            signal,
          ),
        ),
      );
    } catch (error) {
      if (signal.aborted) return;
      const key = error instanceof Error ? error.message : "";
      await update(recipient.id, {
        status: ["authError", "marketingSetupNeeded"].includes(key)
          ? "failed"
          : "unknown",
        errorCode: ["authError", "marketingSetupNeeded"].includes(key)
          ? key
          : "marketingDeliveryUnknown",
      });
    }
    // Sequential delivery respects the provider's small free-tier request rate.
    if (!signal.aborted)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, 550);
        function done() {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          resolve();
        }
        signal.addEventListener("abort", done, { once: true });
      });
  }
}
/** Reconcile only opaque receipts/opt-outs; never upload a contact list. */
export async function reconcileMarketing(vault: VaultController) {
  const data = vault.getData();
  if (!data || vault.demo || !cloudConfigured) return;
  const ids = data.newsletters.flatMap((n) =>
    n.recipients
      .filter((r) => r.status !== "sent" && r.status !== "failed")
      .map((r) => r.id),
  );
  const consents = data.clients.flatMap((c) =>
    Object.values(c.marketingConsent ?? {})
      .filter((g) => g && !g.revokedAt)
      .map((g) => g!.id),
  );
  if (!ids.length && !consents.length) return;
  const cloud = await getCloud();
  if (!cloud) return;
  const receipts: Record<string, unknown>[] = [],
    revoked = new Map<string, string>();
  for (let at = 0; at < ids.length; at += 100) {
    const result = await cloud
      .from("marketing_delivery_receipts")
      .select(
        "id,status,provider_id,accepted_at,error_code,message_id,created_at,channel",
      )
      .in("id", ids.slice(at, at + 100));
    if (result.error) throw new Error("marketingSetupNeeded");
    receipts.push(...result.data);
  }
  for (let at = 0; at < consents.length; at += 100) {
    const result = await cloud
      .from("marketing_consents")
      .select("id,revoked_at")
      .in("id", consents.slice(at, at + 100))
      .not("revoked_at", "is", null);
    if (result.error) throw new Error("marketingSetupNeeded");
    for (const r of result.data) revoked.set(r.id, r.revoked_at);
  }
  const live = vault.getData();
  if (!live) return;
  const receiptById = new Map(receipts.map((r) => [r.id, r]));
  const apply = (current: typeof live) => {
    for (const c of current.clients)
      for (const g of Object.values(c.marketingConsent ?? {}))
        if (g && revoked.has(g.id)) g.revokedAt = revoked.get(g.id);
    for (const n of current.newsletters) {
      const newestActivity = Math.max(
        n.updatedAt ?? Date.parse(n.createdAt),
        ...n.recipients.map((r) => Date.parse(r.requestedAt ?? n.createdAt)),
        ...n.recipients.map((r) =>
          Date.parse(String(receiptById.get(r.id)?.created_at ?? n.createdAt)),
        ),
      );
      for (const r of n.recipients) {
        const receipt = receiptById.get(r.id);
        if (r.status === "sent" || r.status === "failed") continue;
        if (!receipt) {
          if (
            Date.now() - newestActivity > 300000 &&
            ["pending", "sending"].includes(r.status)
          ) {
            r.errorCode = "marketingInterrupted";
            r.status = r.status === "pending" ? "failed" : "unknown";
          }
          continue;
        }
        const status =
          receipt.status === "sending" &&
          Date.now() - Date.parse(String(receipt.created_at)) > 300000
            ? "unknown"
            : receipt.status;
        if (["sending", "sent", "failed", "unknown"].includes(String(status)))
          Object.assign(r, {
            status,
            providerId: receipt.provider_id ?? undefined,
            acceptedAt: receipt.accepted_at ?? undefined,
            errorCode:
              status === "sent" ? undefined : (receipt.error_code ?? undefined),
            messageId: receipt.message_id || r.messageId,
            channel:
              receipt.channel === "email" || receipt.channel === "telegram"
                ? receipt.channel
                : r.channel,
          });
      }
      n.status = newsletterStatus(n);
    }
  };
  const next = structuredClone(live);
  apply(next);
  if (
    JSON.stringify(next.clients) !== JSON.stringify(live.clients) ||
    JSON.stringify(next.newsletters) !== JSON.stringify(live.newsletters)
  )
    await vault.update(apply);
}
