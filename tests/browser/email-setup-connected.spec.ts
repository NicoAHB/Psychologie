import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
test('provider setup persists across reloads without a build flag or browser secrets, and tests only the owner account', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_EMAIL_TEST !== 'true', 'Requires the fake, intercepted email-test build.');
  test.setTimeout(90000);
  const key = 're_synthetic_for_browser_test_only', user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', created_at: new Date().toISOString() };
  const encoded = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url'), token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
  await page.addInitScript(({ user, token }) => localStorage.setItem('sb-email-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' })), { user, token });
  let status = { ready: false, enabled: false, editable: true, keyStored: false, senderEmail: '', senderName: '', accountEmail: user.email, source: 'none' };
  const requests: Record<string, unknown>[] = [];
  await page.route('https://email-test.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path !== '/functions/v1/send-client-email') throw new Error(`Unexpected synthetic request: ${path}`);
    const body = route.request().postDataJSON(); requests.push(body);
    if (body.action === 'status') return route.fulfill({ json: status });
    if (body.action === 'save') {
      expect(body.apiKey === key || body.apiKey === '').toBe(true);
      status = { ...status, ready: body.enabled, enabled: body.enabled, keyStored: true, senderEmail: body.senderEmail, senderName: body.senderName, source: 'saved' };
      return route.fulfill({ json: status });
    }
    if (body.action === 'test') { expect(body.to).toBeUndefined(); expect(body.attachment).toBeUndefined(); return route.fulfill({ json: { providerId: 'synthetic-receipt', acceptedAt: new Date().toISOString() } }); }
    throw new Error('Only synthetic setup requests are expected');
  });
  const { data } = workflowData(), read = await seedWorkflow(page, data); await expect(page.locator('.sync-bar')).toContainText(de.saved); const before = await read(); await nav(page, de.settings); const card = page.locator('#settings-email');
  await expect(card.getByLabel(de.emailSetupSenderAddress, { exact: true })).toBeVisible();
  await card.getByLabel(de.emailSetupSenderName, { exact: true }).fill('Praxis Beispiel');
  await card.getByLabel(de.emailSetupSenderAddress, { exact: true }).fill('kontakt@example.com');
  const api = card.getByLabel(de.emailSetupApiKey, { exact: true }); await api.fill(key); await expect(api).toHaveAttribute('type', 'password');
  await card.getByRole('button', { name: de.emailSetupShowKey, exact: true }).click(); await expect(api).toHaveAttribute('type', 'text');
  await card.getByRole('button', { name: de.save, exact: true }).click();
  await expect(card.getByRole('button', { name: /Gespeichert um/ })).toBeDisabled(); await expect(api).toHaveValue(''); await expect(api).toHaveAttribute('type', 'password');
  expect(requests.filter(x => x.action === 'test')).toHaveLength(0);
  await card.getByRole('button', { name: de.emailSetupSendTest, exact: true }).click(); await expect(card.getByText(de.emailSetupTestAccepted, { exact: false })).toBeVisible();
  await page.reload(); await unlock(page); await nav(page, de.settings);
  await expect(card.getByLabel(de.emailSetupSenderAddress, { exact: true })).toHaveValue('kontakt@example.com'); await expect(card.getByLabel(de.emailSetupApiKey, { exact: true })).toHaveValue('');
  await card.getByRole('checkbox', { name: de.emailSetupEnabled, exact: true }).uncheck(); await card.getByRole('button', { name: de.save, exact: true }).click();
  await expect(card.getByText(de.emailSetupPaused, { exact: true })).toBeVisible(); await expect(card.getByRole('button', { name: de.emailSetupSendTest, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Українська', exact: true }).first().click(); await expect(card.getByText(uk.emailSetupPaused, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1180 }); await page.getByLabel(uk.fontSize, { exact: true }).selectOption('extraLarge');
  await page.getByLabel(uk.colorScheme, { exact: true }).selectOption('dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('#settings-email').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await read()).toEqual(before);
  expect(await page.evaluate(secret => JSON.stringify({ ...localStorage }).includes(secret), key)).toBe(false);
  expect(JSON.stringify(await read()).includes(key)).toBe(false);
  expect(requests.filter(x => x.action === 'test')).toHaveLength(1);
  await page.getByRole('button', { name: 'Deutsch', exact: true }).first().click();
  await card.getByLabel(de.emailSetupApiKey, { exact: true }).fill(key);
  await page.getByRole('button', { name: de.lock, exact: true }).last().click(); await unlock(page); await nav(page, de.settings);
  await expect(card.getByLabel(de.emailSetupApiKey, { exact: true })).toHaveValue('');
  await expect(card.getByText(de.emailSetupPaused, { exact: true })).toBeVisible();
  expect(requests.filter(x => x.action === 'save')).toHaveLength(2);
});
