import { test, expect } from './fixtures';

test('configured invoice delivery sends PDFs and client-language captions, records real receipts and never retries Telegram automatically', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_EMAIL_TEST !== 'true', 'Requires an explicit test build with fake public Supabase settings and mocked transports.');
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', created_at: new Date().toISOString() };
  const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await page.addInitScript(({ user, token }) => localStorage.setItem('sb-email-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' })), { user, token });
  const emails: any[] = []; const telegrams: any[] = []; const acceptedAt = new Date().toISOString();
  await page.route('https://email-test.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname; if (path === '/auth/v1/user') return route.fulfill({ json: user });
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    if (path === '/functions/v1/send-client-email') { emails.push(route.request().postDataJSON()); return route.fulfill(emails.length === 1 ? { status: 503, json: { error: 'emailSendError' } } : { json: { providerId: 'test-email-receipt', acceptedAt } }); }
    if (path === '/functions/v1/send-client-telegram') { telegrams.push(route.request().postDataJSON()); return route.fulfill(telegrams.length === 1 ? { status: 503, json: { error: 'telegramSendError' } } : { json: { messageId: 42, acceptedAt } }); }
    throw new Error(`Unexpected request: ${path}`);
  });
  await page.goto('/'); await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase'); await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase'); await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click(); await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' }); if (await menu.isVisible()) await menu.click(); await page.getByRole('navigation').getByRole('button', { name: 'Klienten', exact: true }).click();
  await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click(); let dialog = page.locator('dialog[open]').last();
  await dialog.getByLabel('Name *', { exact: true }).fill('Олена Тест'); await dialog.getByLabel('E-Mail-Adresse des Klienten', { exact: true }).fill('olena@example.com'); await dialog.getByLabel('Telegram-Chat-ID (optional)', { exact: true }).fill('123456789'); await dialog.getByLabel('Erinnerungen auf Ukrainisch senden').check();
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Sitzung erfassen', exact: true }).click(); await page.locator('dialog[open]').getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Finanzen', exact: true }).click(); await page.locator('.client-finances').getByRole('button', { name: 'Rechnung erstellen', exact: true }).click(); await page.locator('dialog[open]').getByRole('button', { name: 'Rechnung erstellen', exact: true }).click();
  const invoice = page.locator('dialog[open]').first(); await invoice.getByRole('button', { name: 'Per E-Mail versenden', exact: true }).click(); dialog = page.locator('dialog[open]').last();
  await expect(dialog.getByLabel('Betreff')).toHaveValue(/Ваш рахунок/); await dialog.getByRole('button', { name: 'E-Mail jetzt versenden' }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(invoice.locator('.invoice-send-history')).not.toContainText('Versendet am');
  await dialog.getByRole('button', { name: 'E-Mail jetzt versenden' }).click(); await expect(dialog.getByText('E-Mail an den Anbieter übergeben am', { exact: false })).toBeVisible(); await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await expect(invoice.locator('.invoice-send-history')).toContainText('Versendet am'); expect(emails).toHaveLength(2); expect(emails[0].requestId).toBe(emails[1].requestId); expect(emails[1].to).toBe('olena@example.com'); expect(emails[1].text).toContain('Добрий день, Олена Тест'); expect(emails[1].text).not.toMatch(/EUR|€/); expect(atob(emails[1].attachment.content).startsWith('%PDF-')).toBe(true);
  await invoice.getByRole('button', { name: 'Per Telegram versenden', exact: true }).click(); await dialog.getByRole('button', { name: 'Jetzt per Telegram versenden' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Keine Versandbestätigung erhalten'); expect(telegrams).toHaveLength(1); await expect(invoice.locator('.invoice-send-history')).toContainText('Versand nicht bestätigt');
  await dialog.getByRole('button', { name: 'Jetzt per Telegram versenden' }).click(); await expect(dialog.getByText('Von Telegram angenommen am', { exact: false })).toBeVisible(); expect(telegrams).toHaveLength(2); expect(telegrams[1].chatId).toBe('123456789'); expect(telegrams[1].text).toContain('Добрий день, Олена Тест'); expect(atob(telegrams[1].attachment.content).startsWith('%PDF-')).toBe(true);
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click(); await expect(invoice.locator('.invoice-send-history')).toContainText('Telegram · angenommen am');
});
