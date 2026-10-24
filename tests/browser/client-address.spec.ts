import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
async function openProfile(page: Page) {
  await nav(page, de.clients); await page.locator('.directory-list button').first().click();
  await page.getByRole('button', { name: de.editClient, exact: true }).click();
  return page.getByRole('dialog');
}

test('follow-up date can be cleared with the keyboard in DE/UA and stays cleared after lock/reload', async ({ page }) => {
  const { data } = workflowData(); data.clients[0].followUpOn = '2027-01-15'; data.clients[0].followUpNote = 'Notiz ohne Datum behalten';
  const read = await seedWorkflow(page, data), dialog = await openProfile(page);
  await dialog.getByRole('button', { name: de.clientFollowUpClear, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(de.clientFollowUpOn, { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('button', { name: de.clientFollowUpClear, exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: de.cancel, exact: true }).click();
  expect((await read()).clients[0].followUpOn).toBe('2027-01-15');
  await page.getByRole('button', { name: de.editClient, exact: true }).click();
  await dialog.getByRole('button', { name: 'Українська', exact: true }).click();
  await dialog.getByRole('button', { name: uk.clientFollowUpClear, exact: true }).click();
  await expect(dialog.getByLabel(uk.clientFollowUpOn, { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: uk.save, exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 15000 });
  const stored = (await read()).clients[0];
  expect(stored.followUpOn).toBeUndefined(); expect(stored.followUpNote).toBe('Notiz ohne Datum behalten');
  expect(stored.address).toBe(data.clients[0].address); expect(stored.postalAddress).toBeUndefined();
  await page.locator('.topbar').getByRole('button', { name: 'Deutsch', exact: true }).click();
  await page.getByRole('button', { name: de.lock, exact: true }).last().click(); await page.reload(); await unlock(page);
  const reopened = await openProfile(page);
  await expect(reopened.getByLabel(de.clientFollowUpOn, { exact: true })).toHaveValue('');
  await expect(reopened.getByLabel(de.clientFollowUpNote, { exact: true })).toHaveValue('Notiz ohne Datum behalten');
});

test('separate address fields preserve leading zeroes and a chosen German country for a Ukrainian-speaking client', async ({ page }) => {
  const { data } = workflowData(), read = await seedWorkflow(page, data);
  await nav(page, de.clients); await page.getByRole('button', { name: de.newClient, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(`${de.name} *`, { exact: true }).fill('Fiktive Adresse');
  await dialog.getByLabel(de.addressStreet, { exact: true }).fill('Beispielstraße 12a');
  await dialog.getByLabel(de.addressPostalCode, { exact: true }).fill('01067');
  await dialog.getByLabel(de.addressCity, { exact: true }).fill('Dresden');
  // An explicit country choice must survive a different client language.
  await dialog.getByLabel(de.addressCountry, { exact: true }).fill('Germany');
  await dialog.getByRole('checkbox', { name: de.ukrainianReminders, exact: true }).check();
  await expect(dialog.getByLabel(de.addressCountry, { exact: true })).toHaveValue('Germany');
  await dialog.getByRole('button', { name: de.save, exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 15000 });
  const stored = (await read()).clients.find(c => c.name === 'Fiktive Adresse')!;
  expect(stored.language).toBe('uk'); expect(stored.postalAddress?.postalCode).toBe('01067');
  expect(stored.address).toBe('Beispielstraße 12a\n01067 Dresden\nGermany');
  await page.getByRole('button', { name: de.editClient, exact: true }).click();
  await expect(dialog.getByLabel(de.addressStreet, { exact: true })).toHaveValue('Beispielstraße 12a');
  await expect(dialog.getByLabel(de.addressPostalCode, { exact: true })).toHaveValue('01067');
});

for (const [width, theme] of [[820, 'light'], [390, 'dark']] as const) test(`Ukrainian address order is localized, accessible and fits ${width}px with large text`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width, height: 1180 });
  const { data } = workflowData(), read = await seedWorkflow(page, data);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await nav(page, de.settings); await page.getByLabel(de.colorScheme, { exact: true }).selectOption(theme);
  await page.getByLabel(de.fontSize, { exact: true }).selectOption('extraLarge');
  await nav(page, de.clients); await page.getByRole('button', { name: de.newClient, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(`${de.name} *`, { exact: true }).fill('Вигадана Адреса');
  await dialog.getByRole('checkbox', { name: de.ukrainianReminders, exact: true }).check();
  await expect(dialog.getByLabel(de.addressCountry, { exact: true })).toHaveValue(de.addressUkraine);
  await dialog.getByLabel(de.addressStreet, { exact: true }).fill('вул. Хрещатик, буд. 22');
  await dialog.getByLabel(de.addressAdditional, { exact: true }).fill('кв. 12');
  await dialog.getByLabel(de.addressCity, { exact: true }).fill('Київ');
  await dialog.getByLabel(de.addressRegion, { exact: true }).fill('Київська область');
  await dialog.getByLabel(de.addressPostalCode, { exact: true }).fill('1001');
  await dialog.getByRole('button', { name: de.save, exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(de.addressInvalidPostalCode);
  await dialog.getByLabel(de.addressPostalCode, { exact: true }).fill('01001');
  await dialog.getByRole('button', { name: 'Українська', exact: true }).click();
  await expect(dialog.getByLabel(uk.addressPostalCode, { exact: true })).toHaveValue('01001');
  await expect(dialog.getByLabel(uk.addressCity, { exact: true })).toHaveValue('Київ');
  const order = await dialog.locator('.client-address-fields .field > span').allTextContents();
  expect(order).toEqual([uk.addressStreet, uk.addressAdditional, uk.addressCity, uk.addressRegion, uk.addressPostalCode, uk.addressCountry]);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: uk.save, exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 15000 });
  const client = (await read()).clients.find(c => c.name === 'Вигадана Адреса')!;
  expect(client.address).toBe('вул. Хрещатик, буд. 22\nкв. 12\nКиїв\nКиївська область\n01001\nUkraine');
  expect(client.postalAddress?.postalCode).toBe('01001');
});
