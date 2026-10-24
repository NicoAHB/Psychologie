import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, workflowData } from './workflow-fixture';

const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;

test('an identical name cannot be saved before reviewing duplicates, even immediately after typing or pressing Enter', async ({ page }, info) => {
  test.setTimeout(90000); await page.setViewportSize({ width: /mobile|iphone/.test(info.project.name) ? 390 : 820, height: 1180 });
  const { data } = workflowData(); data.clients[0].name = 'Alex von Beispiel'; data.clients[0].email = ''; data.clients[0].contact = '';
  const read = await seedWorkflow(page, data); await nav(page, de.clients);
  await page.getByRole('button', { name: de.newClient, exact: true }).first().click();
  const form = page.getByRole('dialog', { name: de.newClient, exact: true });
  await form.getByLabel(`${de.name} *`, { exact: true }).fill('Alex von Beispiel');
  // A native submit checks the latest input without waiting for the debounced visual hint.
  await form.locator('form').evaluate((node: HTMLFormElement) => node.requestSubmit());
  const review = page.getByRole('dialog', { name: de.duplicateReviewTitle, exact: true });
  await expect(review).toBeVisible(); await expect(review).toContainText('Alex von Beispiel'); expect((await read()).clients).toHaveLength(1);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await review.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await review.getByRole('button', { name: de.duplicateReviewBack, exact: true }).click();
  await expect(form.getByLabel(`${de.name} *`, { exact: true })).toHaveValue('Alex von Beispiel');
  const notice = form.getByRole('region', { name: de.duplicateClientsTitle, exact: true });
  await expect(notice).toBeVisible();
  // The warning must be visible while entering the name, without visiting the optional fields.
  await form.getByLabel(`${de.name} *`, { exact: true }).scrollIntoViewIfNeeded();
  await expect(notice).toBeInViewport();
  await form.getByLabel(`${de.name} *`, { exact: true }).press('Enter'); await expect(review).toBeVisible(); expect((await read()).clients).toHaveLength(1);
  await review.getByRole('button', { name: de.duplicateOpen, exact: true }).click();
  await expect(form).toHaveCount(0); await expect(review).toHaveCount(0); expect((await read()).clients).toHaveLength(1);
});

test('only an explicit choice creates a separate record; approval is not reused for the next client', async ({ page }) => {
  const { data, client } = workflowData(); client.name = 'Alex von Beispiel';
  const read = await seedWorkflow(page, data); await nav(page, de.clients);
  await page.getByRole('button', { name: de.newClient, exact: true }).first().click();
  const form = page.getByRole('dialog', { name: de.newClient, exact: true }); await form.getByLabel(`${de.name} *`, { exact: true }).fill(client.name);
  await form.getByRole('button', { name: de.save, exact: true }).click();
  const review = page.getByRole('dialog', { name: de.duplicateReviewTitle, exact: true }); await expect(review).toBeVisible(); expect((await read()).clients).toHaveLength(1);
  await review.getByRole('button', { name: de.duplicateReviewCreate, exact: true }).click(); await expect(form).toHaveCount(0, { timeout: 15000 });
  expect((await read()).clients).toHaveLength(2);
  await page.getByRole('button', { name: de.newClient, exact: true }).first().click(); await form.getByLabel(`${de.name} *`, { exact: true }).fill(client.name);
  await form.getByRole('button', { name: de.save, exact: true }).click(); await expect(review).toBeVisible(); expect((await read()).clients).toHaveLength(2);
  await review.getByRole('button', { name: de.duplicateReviewBack, exact: true }).click();
  await form.getByLabel(`${de.name} *`, { exact: true }).fill('Andere eigenständige Person');
  await form.getByRole('button', { name: de.save, exact: true }).click(); await expect(form).toHaveCount(0, { timeout: 15000 }); expect((await read()).clients).toHaveLength(3);
});

test('duplicate review translates without losing the draft and fits a dark phone with large text', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 390, height: 1180 });
  const { data, client } = workflowData(); await seedWorkflow(page, data);
  await nav(page, de.settings); await page.getByLabel(de.colorScheme, { exact: true }).selectOption('dark'); await page.getByLabel(de.fontSize, { exact: true }).selectOption('extraLarge');
  await nav(page, de.clients); await page.getByRole('button', { name: de.newClient, exact: true }).first().click();
  const form = page.getByRole('dialog', { name: de.newClient, exact: true }); await form.getByLabel(`${de.name} *`, { exact: true }).fill(client.name);
  await form.getByRole('button', { name: de.save, exact: true }).click();
  const review = page.getByRole('dialog', { name: de.duplicateReviewTitle, exact: true }); await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Українська', exact: true }).click();
  const translated = page.getByRole('dialog', { name: uk.duplicateReviewTitle, exact: true });
  await expect(translated.getByRole('button', { name: uk.duplicateReviewCreate, exact: true })).toBeVisible();
  expect(await translated.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await translated.getByRole('button', { name: uk.duplicateReviewBack, exact: true }).click();
  await expect(page.getByRole('dialog', { name: uk.newClient, exact: true }).getByLabel(`${uk.name} *`, { exact: true })).toHaveValue(client.name);
});
