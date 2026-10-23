import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { nav, seedWorkflow, workflowData, unlock } from "./workflow-fixture";
import { uid } from "../../src/lib/types";
import type { Client, MarketingConsent } from "../../src/lib/types";
const grantMarketingConsent = (
  client: Client,
  _channel: "email",
): MarketingConsent => ({
  id: uid(),
  token: "A".repeat(43),
  destination: client.email!.toLowerCase(),
  grantedAt: new Date().toISOString(),
});
const marketingPreset = (_kind: string) => ({
  title: "Willkommen",
  content: "Willkommen in der Praxis.",
  contentUk: "Вітаємо у практиці.",
  category: "info" as const,
});
const de = JSON.parse(
  await readFile(new URL("../../src/locales/de.json", import.meta.url), "utf8"),
) as Record<string, string>;
test.use({ actionTimeout: 10000 });
// Closing follows an encrypted durable write. Headed software-rendered WebKit
// on a shared runner can need more than the default five-second assertion.
async function saved(
  dialog: ReturnType<import("@playwright/test").Page["getByRole"]>,
) {
  try {
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
  } catch (error) {
    const visible = await dialog
      .innerText()
      .catch(() => "(dialog unavailable)");
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nVisible dialog state: ${visible.slice(-2500)}`,
    );
  }
}
const uk = JSON.parse(
  await readFile(new URL("../../src/locales/uk.json", import.meta.url), "utf8"),
) as Record<string, string>;
test("marketing templates, prefill, consent and inactive campaigns persist encrypted after locking", async ({
  page,
}) => {
  test.setTimeout(90000);
  const { data, client } = workflowData();
  (client as Client).language = "de";
  const read = await seedWorkflow(page, data);
  await nav(page, "Vorlagen-Verwaltung");
  await page
    .getByRole("button", { name: de.marketingNewTemplate, exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(de.marketingTemplateTitle, { exact: true })
    .fill("Organisation Oktober");
  await dialog
    .getByLabel(de.marketingMessageDe, { exact: true })
    .fill("Die Praxis ist nächste Woche geöffnet.");
  await dialog.locator("summary").click();
  await dialog
    .getByLabel(de.marketingMessageUk, { exact: true })
    .fill("Практика працює наступного тижня.");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await saved(dialog);
  await page
    .getByRole("button", { name: de.marketingUseTemplate, exact: true })
    .click();
  await expect(
    page.getByLabel(de.marketingMessageDe, { exact: true }),
  ).toHaveValue("Die Praxis ist nächste Woche geöffnet.");
  await expect(
    page.getByRole("button", { name: de.marketingSend, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: `${de.editClient}: ${client.name}`,
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(de.marketingConsentEmail, { exact: true }).check();
  await dialog.getByLabel(de.marketingConsentTelegram, { exact: true }).check();
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await saved(dialog);
  await page.getByLabel(de.marketingSelectAll, { exact: true }).check();
  await expect(page.getByText("1 ausgewählt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Українська", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: uk.newsletter, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(uk.marketingMessageDe, { exact: true }),
  ).toHaveValue("Die Praxis ist nächste Woche geöffnet.");
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await nav(page, "Kampagnen");
  await page
    .getByRole("button", { name: de.marketingNewCampaign, exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(de.marketingCampaignName, { exact: true })
    .fill("Geburtstagsinformation");
  await dialog
    .getByLabel(de.marketingTemplate, { exact: true })
    .selectOption({ label: "Organisation Oktober" });
  await expect(
    dialog.getByLabel(de.marketingCampaignActive, { exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await saved(dialog);
  await page
    .getByRole("button", { name: "Sperren", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Willkommen zurück.", exact: true }),
  ).toBeVisible();
  await page.reload();
  await unlock(page);
  const stored = await read();
  expect(stored.messageTemplates[0].contentUk).toContain("Практика");
  expect(stored.marketingCampaigns[0].isActive).toBe(false);
  expect(stored.clients[0].marketingConsent?.email?.token).toMatch(
    /^[A-Za-z0-9_-]{43}$/,
  );

  expect(stored.clients[0].marketingConsent?.telegram?.token).toMatch(
    /^[A-Za-z0-9_-]{43}$/,
  );
  await nav(page, "Newsletter");
  await page
    .getByRole("button", {
      name: `${de.editClient}: ${client.name}`,
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel(de.marketingConsentEmail, { exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByLabel(de.marketingConsentTelegram, { exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: de.marketingNoMessages, exact: true })
    .click();
  await expect(
    dialog.getByLabel(de.marketingConsentEmail, { exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByLabel(de.marketingConsentTelegram, { exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await saved(dialog);
  await expect(
    page.getByLabel(de.marketingSelectAll, { exact: true }),
  ).toBeDisabled();
  const optedOut = await read();
  expect(optedOut.clients[0].marketingConsent?.email?.revokedAt).toBeTruthy();
  expect(
    optedOut.clients[0].marketingConsent?.telegram?.revokedAt,
  ).toBeTruthy();
  await nav(page, "Kampagnen");
  await page
    .getByRole("switch", {
      name: `${de.marketingCampaignActive}: Geburtstagsinformation`,
      exact: true,
    })
    .check();
  await expect
    .poll(async () => (await read()).marketingCampaigns[0].isActive)
    .toBe(true);
  await nav(page, "Vorlagen-Verwaltung");
  await page
    .getByRole("button", {
      name: `${de.marketingDeleteTemplate}: Organisation Oktober`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Löschen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const final = await read();
  expect(final.messageTemplates).toHaveLength(0);
  expect(final.marketingCampaigns[0].isActive).toBe(false);
});
for (const width of [390, 820])
  test(`marketing views and dialogs remain accessible at ${width}px`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "Widths are explicitly checked here.",
    );
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 1180 });
    const { data, client } = workflowData();
    data.messageTemplates.push({
      id: uid(),
      createdAt: new Date().toISOString(),
      ...marketingPreset("welcome"),
    });
    data.clients[0].marketingConsent = {
      email: grantMarketingConsent(client, "email"),
    };
    data.newsletters.push({
      id: uid(),
      createdAt: new Date().toISOString(),
      channel: "email",
      messages: [
        {
          id: "message",
          title: "Organisation",
          content: "Wir wünschen Ihnen einen guten Tag.",
        },
      ],
      recipients: [
        {
          id: uid(),
          clientId: client.id,
          consentId: uid(),
          messageId: "message",
          language: "de",
          channel: "email",
          status: "sent",
          acceptedAt: new Date().toISOString(),
        },
      ],
      recipientCount: 1,
      status: "sent",
    });
    await seedWorkflow(page, data);
    await page.addStyleTag({
      content:
        "*,*::before,*::after{transition:none!important;animation:none!important}",
    });
    const scan = async () => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
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
    };
    await nav(page, "Newsletter");
    await scan();
    await page
      .getByLabel(de.marketingMessageDe, { exact: true })
      .fill("Vorhandener Text");
    await page
      .getByLabel(de.marketingTemplate, { exact: true })
      .selectOption(data.messageTemplates[0].id);
    await scan();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Abbrechen", exact: true })
      .click();

    await page
      .getByRole("tab", { name: de.marketingArchive, exact: true })
      .click();
    await page.locator(".marketing-archive-row").click();
    await scan();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Schließen", exact: true })
      .last()
      .click();
    await nav(page, "Vorlagen-Verwaltung");
    await scan();
    await page
      .getByRole("button", { name: de.marketingNewTemplate, exact: true })
      .click();
    await scan();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Abbrechen", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `${de.marketingDeleteTemplate}: Willkommen`,
        exact: true,
      })
      .click();
    await scan();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Abbrechen", exact: true })
      .click();
    await nav(page, "Kampagnen");
    await page
      .getByRole("button", { name: de.marketingNewCampaign, exact: true })
      .click();
    await scan();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Abbrechen", exact: true })
      .click();
  });
