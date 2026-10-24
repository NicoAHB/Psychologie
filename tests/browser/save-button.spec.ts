import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
const savedDe = /^Gespeichert um \d{2}:\d{2}$/;

test('practice save shows its completion time, switches language and resets for every kind of edit', async ({ page }) => {
  test.setTimeout(90000);
  // Fix device time before unlocking; moving it hours forward in an open vault
  // correctly triggers the existing inactivity lock on the next interaction.
  await page.clock.setFixedTime(new Date('2026-10-24T14:37:00Z'));
  const { data } = workflowData(), read = await seedWorkflow(page, data);
  await nav(page, de.settings);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const practice = page.locator('#settings-practice');
  await practice.getByLabel(de.practiceName, { exact: true }).fill('Praxis Zeitstempel');
  await practice.getByRole('button', { name: de.save, exact: true }).click();
  const saved = practice.getByRole('button', { name: savedDe });
  await expect(saved).toBeDisabled({ timeout: 15000 });
  const time = await page.evaluate(() => new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
  await expect(saved).toHaveText(de.savedAtTime.replace('{time}', time));
  expect((await read()).settings.practice.name).toBe('Praxis Zeitstempel');
  await expect(saved).toHaveClass(/btn-save-saved/);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel(de.colorScheme, { exact: true }).selectOption(theme);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.locator('.topbar').getByRole('button', { name: 'Українська', exact: true }).click();
  await expect(practice.getByRole('button', { name: uk.savedAtTime.replace('{time}', time), exact: true })).toBeDisabled();
  await practice.getByLabel(uk.practiceAddress, { exact: true }).fill('Neue Anschrift');
  await expect(practice.getByRole('button', { name: uk.save, exact: true })).toBeEnabled();
  await practice.getByRole('button', { name: uk.save, exact: true }).click();
  await expect(practice.getByRole('button', { name: /^Збережено о / })).toBeDisabled({ timeout: 15000 });
  await practice.getByLabel(uk.practiceIbanUa, { exact: true }).fill('UA-NEU');
  await expect(practice.getByRole('button', { name: uk.save, exact: true })).toBeEnabled();
  await practice.getByRole('button', { name: uk.save, exact: true }).click();
  await expect(practice.getByRole('button', { name: /^Збережено о / })).toBeDisabled({ timeout: 15000 });
  // An automatically fetched rate also changes this form, without a keystroke.
  await practice.getByRole('button', { name: uk.loadOfficialRate, exact: true }).click();
  await expect(practice.getByRole('button', { name: uk.save, exact: true })).toBeEnabled();
  await page.getByLabel(uk.fontSize, { exact: true }).selectOption('extraLarge');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('fee save is independent, reactivates after edits and persists after lock/reload', async ({ page }) => {
  const { data } = workflowData(), read = await seedWorkflow(page, data);
  await nav(page, de.settings);
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: de.cancellationFeeSettings, exact: true }) });
  await card.getByLabel(de.defaultCancellationFee, { exact: true }).fill('40');
  await card.getByRole('button', { name: de.save, exact: true }).click();
  await expect(card.getByRole('button', { name: savedDe })).toBeDisabled({ timeout: 15000 });
  await expect(page.locator('#settings-practice').getByRole('button', { name: de.save, exact: true })).toBeEnabled();
  await card.getByLabel(de.defaultCancellationFee, { exact: true }).fill('45');
  await expect(card.getByRole('button', { name: de.save, exact: true })).toBeEnabled();
  await card.getByRole('button', { name: de.save, exact: true }).click();
  await expect(card.getByRole('button', { name: savedDe })).toBeDisabled({ timeout: 15000 });
  expect((await read()).settings.defaultCancellationFeeCents).toBe(4500);
  await page.getByRole('button', { name: de.lock, exact: true }).last().click();
  await page.reload(); await unlock(page); await nav(page, de.settings);
  await expect(page.getByLabel(de.defaultCancellationFee, { exact: true })).toHaveValue('45');
});

test('failed encrypted storage does not claim success and the save button can retry', async ({ page }) => {
  const { data } = workflowData(), read = await seedWorkflow(page, data);
  await nav(page, de.settings);
  const practice = page.locator('#settings-practice');
  await practice.getByLabel(de.practiceName, { exact: true }).fill('Nach Fehler gespeichert');
  // Fail exactly one vault write. All data are synthetic; no external calls.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'vault') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Synthetic full disk', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await practice.getByRole('button', { name: de.save, exact: true }).click();
  await expect(practice.getByRole('alert')).toContainText(de.storageError, { timeout: 15000 });
  await expect(practice.getByRole('button', { name: de.save, exact: true })).toBeEnabled();
  await expect(practice.getByRole('button', { name: savedDe })).toHaveCount(0);
  await practice.getByRole('button', { name: de.save, exact: true }).click();
  await expect(practice.getByRole('button', { name: savedDe })).toBeDisabled({ timeout: 15000 });
  expect((await read()).settings.practice.name).toBe('Nach Fehler gespeichert');
});
