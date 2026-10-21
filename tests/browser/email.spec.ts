import { test, expect } from './fixtures';

test('direct email records only provider acceptance and reuses a pending request after failure', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_EMAIL_TEST !== 'true', 'Requires the explicit email-test build with fake public Supabase settings.');
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', created_at: new Date().toISOString() };
  const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await page.addInitScript(({ user, token }) => localStorage.setItem('sb-email-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test-only-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' })), { user, token });
  const requests: any[] = []; const acceptedAt = new Date().toISOString();
  await page.route('https://email-test.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/functions/v1/send-client-email') {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      requests.push(route.request().postDataJSON());
      return route.fulfill(requests.length === 1 ? { status: 503, json: { error: 'emailSendError' } } : { json: { providerId: 'controlled-provider-receipt', acceptedAt } });
    }
    throw new Error(`Unexpected external request: ${path}`);
  });
  await page.goto('/'); await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase');
  await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click(); await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' }); if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: 'Klienten', exact: true }).click();
  await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill('Versand Test'); await dialog.getByLabel('E-Mail-Adresse des Klienten', { exact: true }).fill('client@example.com');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: 'Dokumente', exact: true }).click(); await page.getByRole('button', { name: 'Dokument hochladen', exact: true }).click();
  await dialog.getByLabel('Datei auswählen', { exact: true }).setInputFiles({ name: 'aufgabe.txt', mimeType: 'text/plain', buffer: Buffer.from('Eine kleine Aufgabe') });
  await dialog.getByRole('checkbox', { name: 'Per E-Mail an Klient versenden', exact: true }).check();
  await dialog.getByRole('button', { name: 'Speichern und E-Mail vorbereiten', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'E-Mail jetzt versenden', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'E-Mail jetzt versenden', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Übergabe der E-Mail konnte nicht bestätigt werden');
  await expect(page.locator('.document-history')).not.toContainText('Versendet am');
  await dialog.getByRole('button', { name: 'E-Mail jetzt versenden', exact: true }).click();
  await expect(dialog.getByText('E-Mail an den Anbieter übergeben am', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await expect(page.locator('.document-history li')).toHaveCount(1);
  await expect(page.locator('.document-history')).toContainText('Versendet am');
  await expect(page.locator('.document-history time')).toHaveAttribute('dateTime', acceptedAt);
  expect(requests).toHaveLength(2); expect(requests[0].requestId).toBe(requests[1].requestId);
  expect(requests[0].to).toBe('client@example.com'); expect(atob(requests[0].attachment.content)).toBe('Eine kleine Aufgabe');
  expect(requests[0].clientId).toBeUndefined(); expect(JSON.stringify(requests[0])).not.toContain('Versand Test');
});
