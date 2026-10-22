import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';

test('self-hosted speech model and WASM also initialize offline under the Pages prefix', async ({ page, context }) => {
  test.skip(!process.env.VITE_BASE_PATH || test.info().project.name === 'mobile', 'Pages-only model check; root suite covers recognition and responsive controls.');
  test.setTimeout(120000); const base = process.env.VITE_BASE_PATH!;
  await page.goto(base); await page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true }).click();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' }); if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: 'Klienten', exact: true }).click();
  await page.locator('.directory-list button').first().click();
  await page.getByRole('button', { name: 'Offline-Paket DE / UA laden (116 MB)', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Offline diktieren', exact: true }).first()).toBeVisible({ timeout: 60000 });
  await context.setOffline(true);
  const result = await page.evaluate(async base => {
    const name = (await caches.keys()).find(key => key.startsWith(`praxisraum:${base}:`) && !key.endsWith(':runtime'))!;
    const requests = await (await caches.open(name)).keys();
    const url = requests.find(request => /speech\.worker-.*\.js$/.test(request.url))!.url;
    if (!new URL(url).pathname.startsWith(base)) throw new Error('Incorrect worker prefix');
    const worker = new Worker(url, { type: 'module' });
    try {
      return await new Promise<string>((resolve, reject) => {
        worker.onerror = event => reject(new Error(event.message));
        worker.onmessage = event => {
          if (event.data.type === 'error') reject(new Error(event.data.error));
          if (event.data.type === 'ready') worker.postMessage({ type: 'transcribe', pcm: new Float32Array(16000), rate: 16000, language: 'uk' });
          if (event.data.type === 'text') resolve(event.data.text);
        };
        worker.postMessage({ type: 'prepare' });
      });
    } finally { worker.terminate(); }
  }, base);
  expect(result).toBe('');
});

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
