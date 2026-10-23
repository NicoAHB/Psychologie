import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { nav, seedWorkflow, workflowData } from "./workflow-fixture";
import { uid } from "../../src/lib/types";
import type { Client, MarketingConsent } from "../../src/lib/types";
const grantMarketingConsent = (
  client: Client,
  channel: "email" | "telegram",
): MarketingConsent => ({
  id: uid(),
  token: "A".repeat(43),
  destination:
    channel === "email" ? client.email!.toLowerCase() : client.telegramChatId,
  grantedAt: new Date().toISOString(),
});
const de = JSON.parse(
  await readFile(new URL("../../src/locales/de.json", import.meta.url), "utf8"),
) as Record<string, string>;
test.use({ actionTimeout: 15000 });
test("newsletter delivery uses per-client language, encrypted images/archive, durable receipts and a token-only opt-out", async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One isolated authenticated transport harness.",
  );
  test.setTimeout(90000);
  const port = Number(process.env.PLAYWRIGHT_PORT || 4173) + 113,
    owner = uid(),
    server = spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      {
        stdio: "ignore",
        env: {
          ...process.env,
          VITE_BASE_PATH: "/",
          VITE_SUPABASE_URL: "https://marketing-test.supabase.co",
          VITE_SUPABASE_ANON_KEY: "public-test-key",
        },
      },
    ),
    context = await browser.newContext({ baseURL: `http://127.0.0.1:${port}` });
  const deliveries: Record<string, unknown>[] = [],
    receipts: Record<string, unknown>[] = [],
    consents = new Map<string, { id: string; revoked_at: string | null }>(),
    projections: unknown[] = [];
  let guestAuth = "";
  await context.addInitScript(
    ({ owner }) => {
      const token = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" }))}.fake`;
      localStorage.setItem(
        "sb-marketing-test-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fake-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: owner,
            aud: "authenticated",
            email: "owner@example.com",
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      );
    },
    { owner },
  );
  await context.route(
    "https://marketing-test.supabase.co/**",
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        body = req.method() === "POST" ? req.postDataJSON() : null;
      const reply = (data: unknown) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (url.pathname === "/auth/v1/user") return reply({ id: owner });
      if (url.pathname.endsWith("/send-marketing")) {
        if (body.action === "capabilities")
          return reply({ ready: true, email: true, telegram: true });
        deliveries.push(body);
        const acceptedAt = new Date().toISOString(),
          providerId = String(deliveries.length);
        receipts.push({
          id: body.id,
          status: "sent",
          accepted_at: acceptedAt,
          provider_id: providerId,
          message_id: body.messageId,
          channel: body.channel,
          created_at: acceptedAt,
        });
        consents.set(body.consentId, { id: body.consentId, revoked_at: null });
        return reply({
          status: "sent",
          acceptedAt,
          providerId,
          messageId: body.messageId,
          channel: body.channel,
        });
      }
      if (url.pathname.endsWith("/unsubscribe_marketing")) {
        guestAuth = req.headers().authorization;
        const c = consents.get(body.p_id);
        if (c) c.revoked_at = new Date().toISOString();
        return reply(!!c);
      }
      if (url.pathname.endsWith("/marketing_delivery_receipts"))
        return reply(receipts);
      if (url.pathname.endsWith("/marketing_consents"))
        return reply([...consents.values()].filter((c) => c.revoked_at));
      if (
        req.method() === "POST" &&
        /\/(message_templates|marketing_campaigns|newsletters)$/.test(
          url.pathname,
        )
      ) {
        projections.push(body);
        return reply(null);
      }
      return reply(null);
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/`)).ok;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).toBe(true);
    const page = await context.newPage(),
      { data, client } = workflowData();
    (client as Client).language = "de";
    data.clients[0].marketingConsent = {
      email: grantMarketingConsent(client, "email"),
      telegram: grantMarketingConsent(client, "telegram"),
    };
    const uk: Client = {
      ...client,
      id: uid(),
      name: "Другий приклад",
      language: "uk" as const,
      email: "uk@example.com",
    };
    uk.marketingConsent = { email: grantMarketingConsent(uk, "email") };
    data.clients.push(uk);
    const telegram: Client = {
      ...client,
      id: uid(),
      name: "Nur Telegram Beispiel",
      email: "telegram-only@example.com",
      telegramChatId: "987654321",
    };
    telegram.marketingConsent = {
      telegram: grantMarketingConsent(telegram, "telegram"),
    };
    const none: Client = {
      ...client,
      id: uid(),
      name: "Keine Nachricht Beispiel",
      email: "none@example.com",
      telegramChatId: "987654322",
      marketingConsent: undefined,
    };
    data.clients.push(telegram, none);

    const read = await seedWorkflow(page, data);
    await nav(page, "Newsletter");
    await page
      .getByRole("checkbox", { name: de.marketingTelegram, exact: true })
      .check();
    await expect(
      page.getByRole("checkbox", { name: de.marketingEmail, exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", {
        name: new RegExp("Keine Nachricht Beispiel"),
      }),
    ).toBeDisabled();

    await page
      .getByLabel(de.marketingMessageDe, { exact: true })
      .fill("Informationen aus der Praxis.");
    await page.getByLabel(de.marketingSelectAll, { exact: true }).check();
    await expect(
      page.getByLabel(de.marketingMessageUk, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: de.marketingSend, exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel(de.marketingMessageUk, { exact: true })
      .fill("Інформація від практики.");
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#597d73";
      c.fillRect(0, 0, 40, 40);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page
      .locator('input[type=file][accept="image/jpeg,image/png,image/webp"]')
      .setInputFiles({
        name: "image.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
    await expect(
      page.getByRole("img", { name: de.marketingImage, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: de.marketingSend, exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: de.marketingSend, exact: true })
      .click();
    const review = page.getByRole("dialog");
    await expect(review).toContainText("4 einzelne Nachrichten");
    await page.addStyleTag({
      content:
        "*,*::before,*::after{transition:none!important;animation:none!important}",
    });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.bringToFront();
    }
    await page.screenshot({
      path: "/tmp/praxisraum-newsletter-review.png",
      fullPage: true,
    });

    await review
      .getByRole("button", { name: de.marketingConfirmSend, exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: de.marketingArchive, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(deliveries.length).toBe(4);
    expect(deliveries.filter((d) => d.to === client.email)).toHaveLength(1);
    expect(
      deliveries.filter((d) => d.to === client.telegramChatId),
    ).toHaveLength(1);
    expect(
      deliveries.filter((d) => d.to === telegram.telegramChatId),
    ).toHaveLength(1);
    expect(
      deliveries.some(
        (d) => d.to === none.email || d.to === none.telegramChatId,
      ),
    ).toBe(false);
    const german = deliveries.find((d) => d.to === client.email)!,
      ukrainian = deliveries.find((d) => d.to === uk.email)!;
    expect(german.text).toContain("Informationen aus der Praxis");
    expect(ukrainian.text).toContain("Інформація від практики");
    expect(ukrainian.text).toContain("#marketing-unsubscribe=");
    expect(JSON.stringify(deliveries)).not.toContain(
      "Sitzungsnotiz bleibt erhalten",
    );
    const stored = await read();
    expect(stored.newsletters[0].recipientCount).toBe(3);
    expect(stored.newsletters[0].channel).toBe("both");
    expect(stored.newsletters[0].recipients).toHaveLength(4);
    expect(
      stored.newsletters[0].recipients.every((r) => r.status === "sent"),
    ).toBe(true);
    const blobId = stored.newsletters[0].messages[0].image!.blobId;
    const packet = await page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("praxisraum", 1);
        r.onsuccess = () => resolve(r.result);
      });
      return new Promise<unknown>((resolve) => {
        const r = db.transaction("blobs").objectStore("blobs").get(id);
        r.onsuccess = () => {
          db.close();
          resolve(r.result);
        };
      });
    }, blobId);
    expect(JSON.stringify(packet)).toContain("ciphertext");
    expect(JSON.stringify(packet)).not.toContain(
      (german.image as { content: string }).content,
    );
    await page.evaluate(async (serialized) => {
      const data = JSON.parse(serialized);
      const cryptoPath = "/src/lib/crypto.ts",
        archivePath = "/src/lib/marketingArchive.ts";
      const { deriveKey } = await import(cryptoPath);
      const { syncMarketingArchive } = await import(archivePath);
      const envelope = await new Promise<{ salt: string; vaultId: string }>(
        (resolve) => {
          const r = indexedDB.open("praxisraum", 1);
          r.onsuccess = () => {
            const db = r.result;
            const q = db
              .transaction("vault")
              .objectStore("vault")
              .get("primary");
            q.onsuccess = () => {
              db.close();
              resolve(q.result);
            };
          };
        },
      );
      await syncMarketingArchive(
        data,
        await deriveKey("a very strong test passphrase", envelope.salt),
        envelope.vaultId,
      );
    }, JSON.stringify(stored));
    expect(projections.length).toBeGreaterThan(0);
    expect(JSON.stringify(projections)).not.toContain(
      "Informationen aus der Praxis",
    );
    expect(JSON.stringify(projections)).not.toContain(client.email);
    expect(JSON.stringify(projections)).not.toContain("Only this");
    await page.locator(".marketing-archive-row").click();
    await expect(page.getByRole("dialog")).toContainText(
      "Informationen aus der Praxis",
    );
    await expect(page.getByRole("dialog")).toContainText(
      "Інформація від практики",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Schließen", exact: true })
      .last()
      .click();
    const link = String(german.text).split("\n").at(-1)!;
    expect(new URL(link).search).toBe("");
    const guest = await context.newPage();
    await guest.goto(link);
    await expect(guest.locator(".app-shell")).toHaveCount(0);
    await guest
      .getByRole("button", { name: de.marketingUnsubscribeButton, exact: true })
      .click();
    await expect(
      guest.getByText(de.marketingUnsubscribeDone, { exact: true }),
    ).toBeVisible();
    expect(guestAuth).toBe("Bearer public-test-key");
    expect(
      (
        await new AxeBuilder({ page: guest })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  } finally {
    await context.close();
    server.kill("SIGTERM");
  }
});
