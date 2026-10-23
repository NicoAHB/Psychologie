import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import {
  campaignOccurrence,
  changedMarketingRevocations,
  grantMarketingConsent,
  marketingConsent,
  marketingId,
  marketingPreset,
  messageForLanguage,
  newsletterStatus,
  validateMarketingMessage,
} from "../src/lib/marketing";
import {
  emptyVault,
  normalizeVault,
  uid,
  type MarketingCampaign,
  type Newsletter,
  type VaultData,
} from "../src/lib/types";
import { stateOf, recordChanges } from "../src/lib/crdt";
import { mergeVaults } from "../src/lib/merge";
import { deleteClient } from "../src/lib/records";
import { referencedBlobs } from "../src/lib/blobs";
import { clientExport } from "../src/lib/clientExport";
import {
  decryptVault,
  deriveKey,
  encryptVault,
  randomSalt,
} from "../src/lib/crypto";
function fixture() {
  const data = emptyVault(),
    client = {
      id: uid(),
      name: "Only this client",
      language: "de" as const,
      email: "test@example.com",
      telegramChatId: "123456789",
      contact: "",
      preparation: "Private notes",
      createdAt: "2026-10-20",
      birthday: "2000-10-23",
      reminderConsent: true,
      timeZone: "Europe/Berlin",
    };
  data.clients.push(client);
  return { data, client };
}
function campaign(): MarketingCampaign {
  return {
    id: uid(),
    name: "Birthday",
    type: "birthday",
    templateId: uid(),
    channel: "email",
    isActive: true,
    triggerDays: 3,
    welcomeFrom: "created",
    repeatYearly: true,
    sendAt: "09:00",
    language: "all",
    createdAt: "2026-10-20",
  };
}
function edit(data: VaultData, actor: string, fn: (d: VaultData) => void) {
  const next = structuredClone(data);
  fn(next);
  recordChanges(data, next, 10, actor);
  return next;
}
function newsletter(clientId: string): Newsletter {
  return {
    id: uid(),
    createdAt: "2026-10-23T12:00:00Z",
    channel: "email",
    messages: [
      {
        id: "message",
        title: "Info",
        content: "Public organization information",
        image: {
          blobId: uid(),
          mimeType: "image/webp",
          fileName: "marketing.webp",
          size: 12,
        },
      },
    ],
    recipients: [
      {
        id: uid(),
        clientId,
        messageId: "message",
        consentId: uid(),
        channel: "email",
        language: "de",
        status: "pending",
      },
    ],
    recipientCount: 1,
    status: "sending",
  };
}
test("legacy vaults default to empty marketing collections without changing schema or opting in contacts", () => {
  const { data, client } = fixture();
  const legacy = structuredClone(data) as Partial<VaultData>;
  delete legacy.newsletters;
  delete legacy.marketingCampaigns;
  delete legacy.messageTemplates;
  const normalized = normalizeVault(legacy as VaultData);
  assert.deepEqual(normalized.newsletters, []);
  assert.deepEqual(normalized.marketingCampaigns, []);
  assert.deepEqual(normalized.messageTemplates, []);
  assert.equal(normalized.schema, 1);
  assert.equal(marketingConsent(client, "email"), undefined);
});
test("marketing is channel-specific, unrelated to reminders, and bound to the current destination", () => {
  const { data, client } = fixture();
  const grant = grantMarketingConsent(client, "email");
  data.clients[0].marketingConsent = { email: grant };
  assert.match(grant.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(marketingConsent(data.clients[0], "email")?.id, grant.id);
  assert.equal(marketingConsent(data.clients[0], "telegram"), undefined);
  const changed = structuredClone(data);
  changed.clients[0].email = "another@example.com";
  assert.equal(marketingConsent(changed.clients[0], "email"), undefined);
  changed.clients[0].marketingConsent!.email!.revokedAt =
    new Date().toISOString();
  assert.deepEqual(changedMarketingRevocations(data, changed), [grant.id]);
  assert.equal(marketingConsent(changed.clients[0], "email"), undefined);
  assert.throws(
    () =>
      grantMarketingConsent(
        { ...client, telegramChatId: "-1001234" },
        "telegram",
      ),
    /marketingContactMissing/,
  );
});
test("localized messages never silently substitute German for Ukrainian and enforce channel/image limits", () => {
  const message = {
    id: uid(),
    title: "Info",
    content: "German",
    contentUk: "Українська",
    titleUk: "Інформація",
  };
  assert.equal(messageForLanguage(message, "uk").text, "Українська");
  assert.throws(
    () => messageForLanguage({ ...message, contentUk: "" }, "uk"),
    /marketingTranslationMissing/,
  );
  assert.throws(
    () =>
      validateMarketingMessage(
        { ...message, content: "x".repeat(3501) },
        "telegram",
      ),
    /marketingTextTooLong/,
  );
  assert.throws(
    () =>
      validateMarketingMessage(
        { ...message, title: "Hello\nBcc: other@example.com" },
        "email",
      ),
    /marketingTextTooLong/,
  );
  assert.equal(marketingPreset("welcome").contentUk?.length! > 0, true);
});
test("events respect client time zone, active status, opt-in, language and send time; missed days are not sent late", () => {
  const { data, client } = fixture();
  data.clients[0].marketingConsent = {
    email: grantMarketingConsent(client, "email"),
  };
  const c = campaign();
  assert.equal(
    campaignOccurrence(
      c,
      data.clients[0],
      data,
      new Date("2026-10-23T06:59:00Z"),
    ),
    undefined,
  );
  assert.equal(
    campaignOccurrence(
      c,
      data.clients[0],
      data,
      new Date("2026-10-23T07:00:00Z"),
    ),
    "2026-10-23",
  );
  assert.equal(
    campaignOccurrence(
      c,
      { ...data.clients[0], status: "paused" },
      data,
      new Date("2026-10-23T12:00:00Z"),
    ),
    undefined,
  );
  assert.equal(
    campaignOccurrence(
      { ...c, language: "uk" },
      data.clients[0],
      data,
      new Date("2026-10-23T12:00:00Z"),
    ),
    undefined,
  );
  assert.equal(
    campaignOccurrence(
      c,
      data.clients[0],
      data,
      new Date("2026-10-24T12:00:00Z"),
    ),
    undefined,
  );
});
test("birthday leap days and welcome/holiday triggers have deterministic calendar semantics", () => {
  const { data, client } = fixture();
  client.birthday = "2000-02-29";
  data.clients[0].marketingConsent = {
    email: grantMarketingConsent(client, "email"),
  };
  const c = campaign();
  assert.equal(
    campaignOccurrence(
      c,
      data.clients[0],
      data,
      new Date("2027-02-28T12:00:00Z"),
    ),
    "2027-02-28",
  );
  assert.equal(
    campaignOccurrence(
      { ...c, type: "welcome" },
      data.clients[0],
      data,
      new Date("2026-10-23T12:00:00Z"),
    ),
    "2026-10-23",
  );
  assert.equal(
    campaignOccurrence(
      { ...c, type: "welcome", welcomeFrom: "firstSession" },
      data.clients[0],
      data,
      new Date("2026-10-23T12:00:00Z"),
    ),
    undefined,
  );
  assert.equal(
    campaignOccurrence(
      { ...c, type: "holiday", targetDate: "2025-10-23" },
      data.clients[0],
      data,
      new Date("2026-10-23T12:00:00Z"),
    ),
    "2026-10-23",
  );
  assert.equal(
    campaignOccurrence(
      { ...c, type: "holiday", targetDate: "2025-10-23", repeatYearly: false },
      data.clients[0],
      data,
      new Date("2026-10-23T12:00:00Z"),
    ),
    undefined,
  );
});
test("stable opaque delivery IDs agree on devices; archive status distinguishes uncertainty from success", async () => {
  assert.equal(
    await marketingId("campaign:2026-10-23:client"),
    await marketingId("campaign:2026-10-23:client"),
  );
  assert.notEqual(await marketingId("a"), await marketingId("b"));
  const n = newsletter("client");
  assert.equal(newsletterStatus(n), "sending");
  n.recipients[0].status = "unknown";
  assert.equal(newsletterStatus(n), "unknown");
  n.recipients.push({ ...n.recipients[0], id: uid(), status: "sent" });
  assert.equal(newsletterStatus(n), "partial");
});
test("field merge preserves independent templates, image versions, recipients and revocations; erasure strips all recipient variants", () => {
  const { data, client } = fixture();
  data.clients[0].marketingConsent = {
    email: grantMarketingConsent(client, "email"),
  };
  data.newsletters.push(newsletter(client.id));
  data.crdt = stateOf(data);
  const a = edit(data, "A", (d) => {
    d.messageTemplates.push({
      ...marketingPreset("welcome"),
      id: uid(),
      createdAt: "2026-10-23",
    });
    d.newsletters[0].recipients[0].status = "sent";
    d.newsletters[0].recipients[0].acceptedAt = "2026-10-23T12:01:00Z";
    d.clients[0].marketingConsent!.email!.revokedAt = "2026-10-23T12:02:00Z";
  });
  const b = edit(data, "B", (d) => {
    d.messageTemplates.push({
      ...marketingPreset("info"),
      id: uid(),
      createdAt: "2026-10-23",
    });
    d.newsletters[0].recipients[0].status = "unknown";
    d.clients[0].marketingConsent!.email!.grantedAt = "2026-10-23T12:01:00Z";
  });
  const merged = mergeVaults(a, b);
  assert.equal(merged.messageTemplates.length, 2);
  assert.equal(merged.newsletters[0].recipients[0].status, "sent");
  assert.ok(merged.clients[0].marketingConsent!.email!.revokedAt);
  assert.ok(
    referencedBlobs(merged).includes(
      data.newsletters[0].messages[0].image!.blobId,
    ),
  );
  const erased = edit(merged, "C", (d) => deleteClient(d, client.id));
  const again = mergeVaults(erased, b);
  assert.equal(again.clients.length, 0);
  assert.equal(again.newsletters[0].recipients.length, 0);
  assert.doesNotMatch(
    JSON.stringify(again.crdt),
    new RegExp(`"clientId":"${client.id}"`),
  );
});
test("encrypted round-trip retains marketing records; readable client ZIP omits unsubscribe secrets and other recipients", async () => {
  const { data, client } = fixture();
  const grant = grantMarketingConsent(client, "email");
  data.clients[0].marketingConsent = { email: grant };
  const n = newsletter(client.id);
  n.recipients.push({
    ...n.recipients[0],
    id: uid(),
    clientId: "OTHER-CLIENT-SECRET",
  });
  data.newsletters.push(n);
  const salt = randomSalt(),
    key = await deriveKey("a very strong test passphrase", salt),
    envelope = await encryptVault(key, data, uid(), salt);
  assert.doesNotMatch(
    JSON.stringify(envelope),
    /Public organization|test@example/,
  );
  assert.deepEqual(
    (await decryptVault(key, envelope)).newsletters,
    data.newsletters,
  );
  const exported = unzipSync(
    (
      await clientExport(
        data,
        client.id,
        "de",
        async () => new Blob(["marketing image"]),
      )
    ).bytes,
  );
  const text = Object.values(exported)
    .map((bytes) => strFromU8(bytes))
    .join("\n");
  assert.doesNotMatch(text, /OTHER-CLIENT-SECRET/);
  assert.ok(!text.includes(grant.token));
  assert.match(text, /Public organization information/);
  assert.ok(Object.keys(exported).some((p) => p.startsWith("newsletter/")));
});
