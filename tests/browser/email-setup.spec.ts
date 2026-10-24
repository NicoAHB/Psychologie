import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, workflowData } from './workflow-fixture';
import { uid } from '../../src/lib/types';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;

test('email setup explains prerequisites, offers a real migration and is linked from the guide', async ({ page }) => {
  const { data } = workflowData(); const read = await seedWorkflow(page, data); await expect(page.locator('.sync-bar')).toContainText(de.saved); const before = await read(); await nav(page, de.guide);
  await page.getByRole('button', { name: de.guideMessagesTitle, exact: true }).click();
  await page.locator('#guide-body-messages').getByRole('button', { name: de.emailSetupOpen, exact: true }).click();
  const card = page.locator('#settings-email'); await expect(card).toBeFocused(); await expect(card.getByRole('heading', { name: de.emailSetupTitle, exact: true })).toBeVisible();
  await expect(card.getByText(de.emailGmailStep1, { exact: true })).toBeVisible();
  await card.getByLabel(de.emailProviderChoice, { exact: true }).selectOption('resend');
  await expect(card.getByText(de.emailSetupSenderHint, { exact: true })).toBeVisible();
  await card.getByText(de.emailSetupBootstrapTitle, { exact: true }).click();
  await expect(card.getByRole('button', { name: de.emailSetupCopySql, exact: true })).toBeEnabled();
  await card.getByText(de.emailSetupShowSql, { exact: true }).click(); await expect(card.locator('pre')).toContainText('create or replace function public.save_email_provider_settings');
  await expect(card.locator('pre')).toContainText('revoke all on vault.secrets');
  await expect(card.getByRole('link', { name: de.emailSetupCreateAccount, exact: true })).toHaveAttribute('href', 'https://resend.com/signup');
  expect(await read()).toEqual(before);
});
test('email setup opens accessibly inside the delivery dialog and preserves the prepared message', async ({ page }) => {
  const { data, client } = workflowData(); const id = uid();
  data.documents.push({ id, clientId: client.id, title: 'Beispielunterlage', createdAt: new Date().toISOString(), file: { blobId: uid(), fileName: 'aufgabe.txt', mimeType: 'text/plain', size: 15 }, returnExpected: false, deliveries: [], returns: [] });
  await seedWorkflow(page, data); await nav(page, de.clients); await page.locator('.directory-list button').first().click();
  await page.getByRole('tab', { name: de.clientDocuments, exact: true }).click();
  await page.getByRole('button', { name: de.emailClientDocument, exact: true }).click(); const composer = page.getByRole('dialog', { name: de.emailClientDocument, exact: true });
  await composer.getByLabel(de.emailSubject, { exact: true }).fill('Meine vorbereitete Nachricht');
  await composer.getByRole('button', { name: de.emailSetupOpen, exact: true }).click(); const setup = page.getByRole('dialog', { name: de.emailSetupTitle, exact: true });
  await expect(setup).toHaveAttribute('aria-labelledby');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape'); await expect(setup).toHaveCount(0); await expect(composer.getByLabel(de.emailSubject, { exact: true })).toHaveValue('Meine vorbereitete Nachricht');
  await expect(composer.getByRole('button', { name: de.emailSetupOpen, exact: true })).toBeFocused();
});
for (const [width, theme] of [[820, 'light'], [390, 'dark']] as const) test(`email instructions are accessible at ${width}px with large text in DE and UK`, async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width, height: 1180 }); const { data } = workflowData(); await seedWorkflow(page, data); await nav(page, de.settings);
  await page.getByLabel(de.colorScheme, { exact: true }).selectOption(theme); await page.getByLabel(de.fontSize, { exact: true }).selectOption('extraLarge');
  const card = page.locator('#settings-email');
  for (const words of [de, uk]) {
    if (words === uk) await page.getByRole('button', { name: 'Українська', exact: true }).first().click();
    await expect(card.getByRole('heading', { name: words.emailSetupTitle, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).include('#settings-email').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(result.violations).toEqual([]);
  }
});
