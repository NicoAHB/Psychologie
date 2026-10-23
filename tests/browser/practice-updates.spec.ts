import { nav } from './workflow-fixture';
import { test, expect, type Page } from './fixtures';
import { readFile } from 'node:fs/promises';
import { deriveKey, encryptVault, randomSalt } from '../../src/lib/crypto';
import { emptyVault, uid } from '../../src/lib/types';


async function seed(page: Page) {
  const data = emptyVault(); const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const client = { id: uid(), name: 'Олена Приклад', language: 'uk' as const, currency: 'UAH' as const, createdAt: '2026-01-01', contact: '', preparation: 'Наступна сесія', telegramChatId: '123456789', email: 'olena@example.com', reminderConsent: false };
  data.clients.push(client); data.settings.exchangeRate = { micros: 48125600, date: `${month}-01`, source: 'manual' };
  Object.assign(data.settings.practice, { name: 'Praxis Beispiel', address: 'Musterweg 1\n10115 Berlin', iban: 'DE-TEST', ibanUa: 'UA-TEST', bankUa: 'Банк України' });
  data.sessions = [
    { id: uid(), clientId: client.id, date: `${now.getFullYear() - 1}-12-02`, time: '14:30', feeCents: 8500, paidAt: `${month}-03`, notes: 'Ältere Sitzung, jetzt bezahlt', tags: [] },
    { id: uid(), clientId: client.id, date: `${month}-02`, time: '11:30', feeCents: 9000, paidAt: null, notes: '', tags: [] },
    { id: uid(), clientId: client.id, date: '2024-02-03', time: '10:00', feeCents: 7500, paidAt: null, notes: 'Frühere offene Sitzung', tags: [] },
  ];
  const salt = randomSalt(); const key = await deriveKey('a very strong test passphrase', salt); const envelope = await encryptVault(key, data, uid(), salt);
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Mit Beispieldaten entdecken' })).toBeVisible();
  await page.evaluate(async envelope => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('praxisraum', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('vault', 'readwrite'); tx.objectStore('vault').put(envelope, 'primary'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); });
  }, envelope);
  await page.reload(); await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase'); await page.getByRole('button', { name: 'Praxisraum öffnen', exact: true }).click(); await expect(page.locator('.app-shell')).toBeVisible();
  return client;
}
test('dashboard links match totals across years; discussed notes have no money and client finances retain payments', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('button', { name: /Zahlungseingänge dieses Monats anzeigen/ })).toContainText('85');
  await page.getByRole('button', { name: /Zahlungseingänge dieses Monats anzeigen/ }).click();
  await expect(page.locator('.finance-records tbody tr')).toHaveCount(1); await expect(page.locator('.finance-records')).toContainText('85');
  await nav(page, 'Heute'); await page.getByRole('button', { name: /Alle offenen Zahlungen anzeigen/ }).click();
  await expect(page.locator('.finance-records tbody tr')).toHaveCount(2); await expect(page.locator('.finance-records')).toContainText('2024');
  await nav(page, 'Heute'); await page.getByRole('button', { name: /Anstehende Termine öffnen/ }).click(); await expect(page.locator('.segmented-tabs button.active').first()).toHaveText('Anstehend');
  await nav(page, 'Heute'); await page.getByRole('button', { name: /Klientenliste öffnen/ }).click();
  await expect(page.locator('.directory-list')).toBeVisible(); await page.locator('.directory-list .client-summary').first().click();
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
  await expect(page.locator('.timeline')).not.toContainText(/€|грн|₴|Bezahlt|Unbezahlt/); await expect(page.locator('.timeline')).toContainText('11:30');
  await page.getByRole('button', { name: 'Notiz ergänzen', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Terminnotiz (optional)').fill('Текст українською'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('.timeline')).toContainText('Текст українською');
  await page.getByRole('tab', { name: 'Zahlungen', exact: true }).click(); await expect(page.locator('.client-finances tbody tr')).toHaveCount(3);
  await expect(page.locator('.client-finances')).toContainText('90'); await expect(page.locator('.client-finances .payment-badge')).toHaveCount(3);
  await nav(page, 'Heute'); await page.getByRole('button', { name: /Klientenliste öffnen/ }).click(); await expect(page.locator('.profile-content')).toHaveCount(0);
});
test('invoice PDF is archived and both composers use client language independently of the UI', async ({ page }) => {
  await seed(page); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await nav(page, 'Zahlungen'); await page.getByRole('button', { name: 'Rechnung erstellen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rechnung erstellen', exact: true }).click();
  const invoice = page.locator('dialog[open]').first(); await expect(invoice.locator('.invoice-sheet')).toContainText('Рахунок'); await expect(invoice.locator('.invoice-sheet')).not.toContainText(/EUR|€/);
  const download = page.waitForEvent('download'); await invoice.getByRole('button', { name: 'PDF herunterladen', exact: true }).click();
  const bytes = await readFile((await (await download).path())!); expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  await invoice.getByRole('button', { name: 'Per E-Mail versenden', exact: true }).click(); const composer = page.locator('dialog[open]').last();
  await expect(composer.getByLabel('Betreff')).toHaveValue(/Ваш рахунок/); await expect(composer.getByLabel('Nachricht', { exact: true })).toHaveValue(/Добрий день, Олена/);
  await expect(composer.getByLabel('Nachricht', { exact: true })).toHaveAttribute('lang', 'uk');
  await expect(composer.locator('.document-attachment')).toContainText('.pdf');
  if (process.env.PLAYWRIGHT_EMAIL_TEST !== 'true') await expect(composer.getByRole('button', { name: 'E-Mail jetzt versenden' })).toBeDisabled();
  await composer.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await invoice.getByRole('button', { name: 'Per Telegram versenden', exact: true }).click();
  await expect(composer.getByLabel('Telegram-Chat-ID des Klienten')).toHaveValue('123456789'); await expect(composer.getByLabel('Nachricht', { exact: true })).toHaveValue(/Добрий день, Олена/);
  if (process.env.PLAYWRIGHT_EMAIL_TEST !== 'true') await expect(composer.getByRole('button', { name: 'Jetzt per Telegram versenden' })).toBeDisabled();
  await composer.getByRole('button', { name: 'Schließen', exact: true }).last().click(); await invoice.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await nav(page, 'Klienten'); await page.locator('.directory-list .client-summary').first().click(); await page.getByRole('tab', { name: 'Dokumente', exact: true }).click();
  await expect(page.locator('.client-document')).toHaveCount(1); await expect(page.locator('.document-download')).toContainText('.pdf'); expect(errors).toEqual([]);
});
