import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
import { uid } from '../../src/lib/types';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;

test('More opens an understandable guide with keyboard topics and bilingual search', async ({ page }) => {
  const { data } = workflowData(); await seedWorkflow(page, data); await nav(page, de.guide);
  await expect(page).toHaveTitle(`${de.guide} · Praxisraum`);
  await expect(page.getByRole('heading', { name: de.guide, exact: true })).toBeVisible();
  await expect(page.locator('.sidebar nav [aria-current="page"]')).toHaveText(de.more);
  await expect(page.locator('.sidebar nav button')).toHaveCount(5); await expect(page.locator('.guide-topic')).toHaveCount(14);
  await expect(page.locator('.guide-flow > li')).toHaveCount(3); await expect(page.locator('.guide-page .btn-primary')).toHaveCount(1);
  const flow = page.getByRole('button', { name: de.guideFlowTitle, exact: true });
  await expect(page.locator('.guide-flow')).toBeHidden(); await flow.focus(); await page.keyboard.press('Enter'); await expect(page.locator('.guide-flow')).toBeVisible();
  await page.keyboard.press('Enter'); await expect(page.locator('.guide-flow')).toBeHidden();
  const clients = page.getByRole('button', { name: de.guideClientsTitle, exact: true });
  await clients.focus(); await page.keyboard.press('Enter'); await expect(clients).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#guide-body-clients')).toBeVisible();
  expect(await page.locator('#guide-body-clients ol').evaluate(node => getComputedStyle(node).listStyleType)).toBe('decimal');
  await page.keyboard.press('Enter'); await expect(page.locator('#guide-body-clients')).toBeHidden();
  await page.getByRole('navigation', { name: de.guideSections, exact: true }).getByRole('button', { name: de.guideGroupSafe, exact: true }).click();
  await expect(page.locator('#guide-group-safe')).toBeFocused();
  const search = page.getByLabel(de.guideSearch, { exact: true }); await search.fill('Urlaub');
  await expect(page.locator('.guide-topic')).toHaveCount(1); await expect(page.locator('#guide-body-appointments')).toBeVisible();
  await page.getByRole('button', { name: 'Українська', exact: true }).first().click();
  await expect(page).toHaveTitle(`${uk.guide} · Praxisraum`);
  await expect(page.getByLabel(uk.guideSearch, { exact: true })).toHaveValue('Urlaub');
  await expect(page.getByRole('button', { name: uk.guideAppointmentsTitle, exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel(uk.guideSearch, { exact: true }).fill('qzxvUnbekannt'); await expect(page.getByRole('heading', { name: uk.guideEmptyTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: uk.guideSearchClear, exact: true }).click(); await expect(page.locator('.guide-topic')).toHaveCount(14);
  await page.getByRole('button', { name: uk.backToMore, exact: true }).click(); await expect(page.locator('.more-navigation button')).toHaveCount(6);
});

test('guide shortcuts focus exact settings and open clients or waitlist without changing records', async ({ page }) => {
  test.setTimeout(90000); const { data, client } = workflowData(); data.clients.push({ ...client, id: uid(), name: 'Pausierte Beispielperson', status: 'paused' });
  const read = await seedWorkflow(page, data); await expect(page.locator('.sync-bar')).toContainText(de.saved); const before = await read();
  const targets = [
    ['setup', 'guideSetupTitle', 'guidePracticeAction', 'practice'], ['setup', 'guideSetupTitle', 'guideBanksAction', 'banks'],
    ['backups', 'guideBackupsTitle', 'guideBackupAction', 'backup'], ['backups', 'guideBackupsTitle', 'guideSecurityAction', 'security'],
    ['devices', 'guideDevicesTitle', 'guideCloudAction', 'cloud'], ['help', 'guideHelpTitle', 'guideAppearanceAction', 'appearance'],
    ['messages', 'guideMessagesTitle', 'guideRemindersAction', 'reminders'],
  ];
  for (const [id, title, action, section] of targets) {
    await nav(page, de.guide); await page.getByRole('button', { name: de[title], exact: true }).click();
    await page.locator(`#guide-body-${id}`).getByRole('button', { name: de[action], exact: true }).click();
    await expect(page.locator(`#settings-${section}`)).toBeFocused();
  }
  await nav(page, de.clients); await page.locator('.directory-list button').first().click();
  await nav(page, de.guide); await page.getByRole('button', { name: de.guideClientsTitle, exact: true }).click();
  await page.locator('#guide-body-clients').getByRole('button', { name: de.guideClientsAction, exact: true }).click();
  await expect(page.getByRole('heading', { name: de.clients, exact: true }).first()).toBeVisible();
  await expect(page.getByLabel(de.clientStatusFilter, { exact: true })).toHaveValue('all'); await expect(page.locator('.directory-list button')).toHaveCount(2);
  await nav(page, de.guide); await page.getByRole('button', { name: de.guideAppointmentsTitle, exact: true }).click();
  await page.getByRole('button', { name: de.guideWaitlistAction, exact: true }).click(); await expect(page.locator('#waitlist-panel')).toBeFocused();
  await nav(page, de.guide); await page.getByRole('button', { name: de.guidePaymentsTitle, exact: true }).click();
  await page.getByRole('button', { name: de.guidePaymentsAction, exact: true }).click(); await expect(page.locator('.finance-open')).toBeVisible();
  expect(await read()).toEqual(before);
});

test('the full guide remains usable offline after reloading and unlocking', async ({ page, context }) => {
  const { data } = workflowData(); await seedWorkflow(page, data);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // As in the existing PWA tests, adopt the worker before going offline.
  await context.setOffline(true); await page.reload(); await unlock(page); await nav(page, de.guide);
  await page.getByLabel(de.guideSearch, { exact: true }).fill('iPad Sicherung'); await expect(page.locator('.guide-topic')).toHaveCount(1);
  await expect(page.locator('#guide-body-backups')).toContainText('In Dateien sichern');
  await page.getByRole('button', { name: 'Українська', exact: true }).first().click();
  await expect(page.locator('#guide-body-backups')).toContainText('Зберегти у Файли');
});

for (const [width, theme] of [[820, 'light'], [390, 'dark']] as const) test(`expanded instructions are accessible in both languages at ${width}px with large text`, async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width, height: 1180 }); const { data } = workflowData(); await seedWorkflow(page, data);
  await nav(page, de.settings); await page.getByLabel(de.colorScheme, { exact: true }).selectOption(theme); await page.getByLabel(de.fontSize, { exact: true }).selectOption('extraLarge');
  await nav(page, de.guide); await page.getByRole('button', { name: de.guideExpandAll, exact: true }).click();
  await page.getByRole('button', { name: de.guideFlowTitle, exact: true }).click();
  await expect(page.locator('.guide-topic .guide-topic-toggle[aria-expanded="true"]')).toHaveCount(14);
  for (const words of [de, uk]) {
    if (words === uk) await page.getByRole('button', { name: 'Українська', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: words.guide, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    const sizes = await page.locator('.guide-topic-toggle').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(sizes.every(size => size >= 44)).toBe(true);
  }
  await page.getByRole('button', { name: uk.guideCollapseAll, exact: true }).click(); await expect(page.locator('.guide-topic .guide-topic-toggle[aria-expanded="true"]')).toHaveCount(0);
});
