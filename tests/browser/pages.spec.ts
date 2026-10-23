import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import { fakeMemoCapture, recordMemo } from './memo-fixture';

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
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible();
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
  await page.getByRole('navigation').getByRole('button', { name: 'Zahlungen', exact: true }).click();
  await page.getByRole('button', { name: 'Rechnung erstellen', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sprache der Rechnung').selectOption('uk'); await dialog.getByRole('button', { name: 'Rechnung erstellen', exact: true }).click();
  await expect(dialog.locator('.invoice-sheet')).toContainText('Рахунок');
  await expect(dialog.locator('.invoice-meta')).toContainText('Термін оплатиНегайно');
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'PDF herunterladen', exact: true }).click();
  expect((await readFile((await (await download).path())!)).subarray(0, 5).toString()).toBe('%PDF-');
});

test('encrypted voice memos play offline with the production CSP under the Pages project path', async ({ page, context }) => {
  test.skip(!process.env.VITE_BASE_PATH, 'This check targets the project-path build.');
  await fakeMemoCapture(page); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.VITE_BASE_PATH!); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true }).click();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' }); if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: 'Klienten', exact: true }).click();
  await page.locator('.directory-list button').first().click(); await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
  await context.setOffline(true); await page.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).first().click(); await recordMemo(page, 'Offline-Memo', 'Von Hand eingegeben');
  await page.locator('.memo-open').first().click(); const viewer = page.getByRole('dialog', { name: 'Offline-Memo', exact: true });
  await expect.poll(() => viewer.locator('audio').evaluate(node => (node as HTMLAudioElement).readyState)).toBeGreaterThan(0);
  await expect(viewer.locator('audio')).toHaveAttribute('src', /^blob:/); await viewer.getByRole('button', { name: 'Abspielen', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Pause', exact: true })).toBeVisible(); await expect(viewer.getByRole('alert')).toHaveCount(0); expect(errors).toEqual([]);
});
