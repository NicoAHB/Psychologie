import { test, expect } from './fixtures';

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
