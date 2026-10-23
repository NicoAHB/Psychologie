import { clientStatus } from "./clientStatus";
import { addDays } from "./dates";
import { validDay } from "./invoice";
import { toBase64 } from "./crypto";
import { translate, type TextKey } from "./i18n";
import {
  uid,
  type Client,
  type MarketingCampaign,
  type MarketingChannel,
  type MarketingChannelSelection,
  type MarketingConsent,
  type MessageTemplate,
  type Newsletter,
  type NewsletterMessage,
  type NewsletterStatus,
  type VaultData,
} from "./types";

/** The selection describes a message/campaign, while each delivery always has one channel. */
export const marketingChannels = (
  selection: MarketingChannelSelection,
): MarketingChannel[] =>
  selection === "both"
    ? ["email", "telegram"]
    : selection === "none"
      ? []
      : [selection];
export function toggleMarketingChannel(
  selection: MarketingChannelSelection,
  channel: MarketingChannel,
): MarketingChannelSelection {
  const channels = new Set(marketingChannels(selection));
  if (channels.has(channel)) channels.delete(channel);
  else channels.add(channel);
  return channels.size === 2
    ? "both"
    : (channels.values().next().value ?? "none");
}
export const marketingChannelText = (
  selection: MarketingChannelSelection,
): TextKey =>
  selection === "both"
    ? "marketingBothChannels"
    : selection === "none"
      ? "marketingNoChannels"
      : selection === "email"
        ? "marketingEmail"
        : "marketingTelegram";
export const clientMarketingChannels = (
  client: Client,
  selection: MarketingChannelSelection,
) =>
  marketingChannels(selection).filter((channel) =>
    marketingConsent(client, channel),
  );
export const newsletterRecipientCount = (
  newsletter: Pick<Newsletter, "recipients" | "recipientCount">,
) =>
  Math.max(
    newsletter.recipientCount,
    new Set(newsletter.recipients.map((r) => r.clientId)).size,
  );

export const marketingDestination = (
  client: Client,
  channel: MarketingChannel,
) =>
  channel === "email"
    ? (client.email ?? "").trim().toLowerCase()
    : client.telegramChatId.trim();
export const validMarketingContact = (
  client: Client,
  channel: MarketingChannel,
) =>
  channel === "email"
    ? marketingDestination(client, channel).length <= 254 &&
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
        marketingDestination(client, channel),
      )
    : /^[1-9]\d{0,15}$/.test(marketingDestination(client, channel)) &&
      Number.isSafeInteger(Number(marketingDestination(client, channel)));
export function marketingConsent(client: Client, channel: MarketingChannel) {
  const consent = client.marketingConsent?.[channel];
  return consent &&
    !consent.revokedAt &&
    consent.destination === marketingDestination(client, channel) &&
    validMarketingContact(client, channel)
    ? consent
    : undefined;
}
export function grantMarketingConsent(
  client: Client,
  channel: MarketingChannel,
  now = new Date().toISOString(),
): MarketingConsent {
  if (!validMarketingContact(client, channel))
    throw new Error("marketingContactMissing");
  return {
    id: uid(),
    token: toBase64(crypto.getRandomValues(new Uint8Array(32)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, ""),
    destination: marketingDestination(client, channel),
    grantedAt: now,
  };
}
export function changedMarketingRevocations(
  before: VaultData,
  after: VaultData,
) {
  const kept = new Set(
    after.clients.flatMap((c) =>
      Object.values(c.marketingConsent ?? {})
        .filter((g) => g && !g.revokedAt)
        .map((g) => g!.id),
    ),
  );
  return before.clients.flatMap((c) =>
    Object.values(c.marketingConsent ?? {})
      .filter((g) => g && !g.revokedAt && !kept.has(g.id))
      .map((g) => g!.id),
  );
}
export const marketingBodyLimit = (
  channel: MarketingChannelSelection,
  image = false,
) =>
  marketingChannels(channel).includes("telegram")
    ? image
      ? 750
      : 3500
    : 10000;
export function messageForLanguage(
  message: NewsletterMessage,
  language: Client["language"],
) {
  const content =
    language === "uk" ? message.contentUk?.trim() : message.content.trim();
  if (!content) throw new Error("marketingTranslationMissing");
  const title =
    language === "uk" ? message.titleUk?.trim() : message.title.trim();
  return {
    subject: (title || content.split("\n")[0]).slice(0, 180),
    text: content,
  };
}
export function validateMarketingMessage(
  message: NewsletterMessage,
  channel: MarketingChannelSelection,
) {
  const limit = marketingBodyLimit(channel, !!message.image);
  if (
    message.content.length > limit ||
    (message.contentUk?.length ?? 0) > limit ||
    message.title.length > 180 ||
    (message.titleUk?.length ?? 0) > 180 ||
    /[\r\n]/.test(message.title + (message.titleUk ?? ""))
  )
    throw new Error("marketingTextTooLong");
  if (!message.content.trim() && !message.contentUk?.trim())
    throw new Error("required");
}
export function newsletterStatus(
  newsletter: Pick<Newsletter, "recipients" | "status">,
): NewsletterStatus {
  const states = newsletter.recipients.map((r) => r.status);
  if (!states.length) return newsletter.status;
  if (states.some((s) => s === "pending" || s === "sending")) return "sending";
  if (states.every((s) => s === "sent")) return "sent";
  if (states.some((s) => s === "sent")) return "partial";
  return states.some((s) => s === "unknown") ? "unknown" : "failed";
}
/** Opaque stable IDs let two devices claim one delivery without sending twice. */
export async function marketingId(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`praxisraum-marketing:v1:${value}`),
    ),
  );
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Reuse the pre-multichannel ID so an old accepted message cannot be sent twice. */
export async function marketingRecipientId(
  existing: Newsletter | undefined,
  newsletterId: string,
  clientId: string,
  channel: MarketingChannel,
) {
  return (
    existing?.recipients.find(
      (r) => r.clientId === clientId && r.channel === channel,
    )?.id ?? (await marketingId(`${newsletterId}:${clientId}:${channel}`))
  );
}
export const templateMessage = (
  template: MessageTemplate,
  id: string = uid(),
): NewsletterMessage => ({
  id,
  title: template.title,
  content: template.content,
  titleUk: template.titleUk,
  contentUk: template.contentUk,
});
export function dayInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function campaignOccurrence(
  campaign: MarketingCampaign,
  client: Client,
  data: VaultData,
  now = new Date(),
) {
  if (
    !campaign.isActive ||
    clientStatus(client) !== "active" ||
    (campaign.language !== "all" && campaign.language !== client.language) ||
    !clientMarketingChannels(client, campaign.channel).length ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(campaign.sendAt)
  )
    return undefined;
  let today: { date: string; time: string };
  try {
    today = dayInZone(now, client.timeZone || data.settings.timeZone);
  } catch {
    return undefined;
  }
  if (today.time < campaign.sendAt) return undefined;
  let due = "";
  if (campaign.type === "birthday") {
    if (!client.birthday || !validDay(client.birthday)) return undefined;
    due = `${today.date.slice(0, 4)}-${client.birthday.slice(5)}`;
    if (!validDay(due) && due.endsWith("-02-29"))
      due = `${today.date.slice(0, 4)}-02-28`;
  } else if (campaign.type === "welcome") {
    if (
      !Number.isInteger(campaign.triggerDays) ||
      campaign.triggerDays < 0 ||
      campaign.triggerDays > 365
    )
      return undefined;
    const start =
      campaign.welcomeFrom === "firstSession"
        ? data.sessions
            .filter((s) => s.clientId === client.id && s.kind !== 'cancellationFee')
            .reduce<
              string | undefined
            >((first, s) => (!first || s.date < first ? s.date : first), undefined)
        : client.createdAt.slice(0, 10);
    if (!start || !validDay(start)) return undefined;
    due = addDays(start, campaign.triggerDays);
  } else {
    if (!campaign.targetDate || !validDay(campaign.targetDate))
      return undefined;
    due = campaign.repeatYearly
      ? `${today.date.slice(0, 4)}-${campaign.targetDate.slice(5)}`
      : campaign.targetDate;
  }
  return validDay(due) && due === today.date ? due : undefined;
}
export function marketingError(error: unknown): TextKey {
  const key = error instanceof Error ? error.message : "";
  return (
    [
      "required",
      "marketingDemo",
      "marketingBusy",
      "marketingBirthdayInvalid",
      "marketingCampaignStopped",
      "marketingInterrupted",
      "marketingChooseChannel",
      "marketingSetupNeeded",
      "marketingConsentMissing",
      "marketingContactMissing",
      "marketingTranslationMissing",
      "marketingDailyLimit",
      "marketingRateLimited",
      "marketingTextTooLong",
      "marketingDeliveryUnknown",
      "marketingSendFailed",
      "authError",
      "invalidImage",
      "storageError",
    ].includes(key)
      ? key
      : "marketingSendFailed"
  ) as TextKey;
}
export function marketingPreset(
  kind: "welcome" | "holiday" | "info",
): Omit<MessageTemplate, "id" | "createdAt"> {
  const title = `marketingPreset_${kind}_title` as TextKey,
    body = `marketingPreset_${kind}_body` as TextKey;
  return {
    title: translate("de", title),
    content: translate("de", body),
    titleUk: translate("uk", title),
    contentUk: translate("uk", body),
    category: kind === "info" ? "info" : "greeting",
  };
}
