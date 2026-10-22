import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';

test('GitHub Pages project path: installable manifest, usable app and offline reload', async ({ page, context }) => {
  test.skip(!process.env.VITE_BASE_PATH, 'This check targets the project-path build.');
  const base = process.env.VITE_BASE_PATH!;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  const manifest = await (await page.request.get(`${base}manifest.webmanifest`)).json();
  expect(manifest.start_url).toBe(base);
  expect(manifest.scope).toBe(base);
  expect(manifest.icons.every((icon: { src: string }) => icon.src.startsWith(base))).toBe(true);
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(base);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meinen Praxisraum einrichten', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meinen Praxisraum einrichten', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a Ukrainian invoice PDF can be generated offline under the Pages project path', async ({ page, context }) => {
  test.skip(!process.env.VITE_BASE_PATH, 'This check targets the project-path build.');
  await page.goto(process.env.VITE_BASE_PATH!); await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true }).click();
  await context.setOffline(true);
  const menu = page.getByRole('button', { name: 'Navigation öffnen' }); if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: 'Finanzen', exact: true }).click();
  await page.getByRole('button', { name: 'Rechnung erstellen', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sprache der Rechnung').selectOption('uk'); await dialog.getByRole('button', { name: 'Rechnung erstellen', exact: true }).click();
  await expect(dialog.locator('.invoice-sheet')).toContainText('Рахунок');
  await expect(dialog.locator('.invoice-meta')).toContainText('Термін оплатиНегайно');
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'PDF herunterladen', exact: true }).click();
  expect((await readFile((await (await download).path())!)).subarray(0, 5).toString()).toBe('%PDF-');
});
