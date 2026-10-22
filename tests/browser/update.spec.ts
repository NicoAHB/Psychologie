import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';
import { test, expect } from './fixtures';

const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
let release = 1; let server: Server; let origin = '';

test.beforeAll(async () => {
  const root = join(process.cwd(), 'dist');
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);
    const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
    try {
      let body = await readFile(file);
      // Every later "release" is the same build with a different worker file, which is what a deployment looks like to the browser.
      if (pathname === '/sw.js' && release > 1) body = Buffer.concat([body, Buffer.from(`\n// release ${release}\n`)]);
      const extension = file.slice(file.lastIndexOf('.'));
      response.writeHead(200, { 'content-type': types[extension] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => { server.close(); });

test('a new build is announced inside the app and applied only on request', async ({ page }) => {
  release = 1;
  await page.goto(`${origin}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // The document must be controlled by the installed worker before a new one counts as an update.
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const banner = page.getByText('Eine neue Version von Praxisraum ist bereit.');
  await expect(banner).toHaveCount(0);

  release = 2;
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Meinen Praxisraum einrichten', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
  await expect(page.getByRole('heading', { name: 'Meinen Praxisraum einrichten', exact: true })).toBeVisible();
  await expect(banner).toHaveCount(0, { timeout: 15000 });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting ?? null)).toBeNull();
});
