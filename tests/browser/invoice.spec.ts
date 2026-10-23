import { nav } from './workflow-fixture';
import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import { addDays } from '../../src/lib/dates';

test('practice profile, invoice with print view, tax-advisor CSV and search across the whole vault', async ({ page }) => {
  const problems: string[] = []; page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (/Content Security Policy|violates/i.test(m.text())) problems.push(m.text()); });
  await page.goto('/');
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase');
  await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible();
  const dialog = page.getByRole('dialog');

  await nav(page, 'Einstellungen');
  await page.getByLabel('Name der Praxis / Ihr Name').fill('Praxis Dr. Muster');
  await page.getByLabel('Anschrift', { exact: true }).fill('Musterweg 7\n10115 Berlin');
  await page.getByLabel('IBAN', { exact: true }).fill('DE02 1203 0000 0000 2020 51');
  await page.getByLabel('Steuerhinweis auf der Rechnung').fill('Umsatzsteuerfrei nach § 4 Nr. 14 UStG (Beispielhinweis)');
  await page.getByRole('button', { name: 'Praxisdaten speichern' }).click(); await expect(page.getByText('Praxisdaten gespeichert.')).toBeVisible();

  await nav(page, 'Klienten'); await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click();
  await dialog.getByLabel('Name *', { exact: true }).fill('Max Mustermann'); await dialog.getByLabel('Anschrift (für Rechnungen)').fill('Lindenallee 3\n80331 München');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Termin nachtragen', exact: true }).click();
  await dialog.getByLabel('Terminnotiz (optional)').fill('Schlafprobleme und Grübeln besprochen');
  await dialog.getByLabel('Bezahlt', { exact: true }).check(); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();

  await nav(page, 'Zahlungen'); await page.getByRole('button', { name: 'Rechnung erstellen' }).click();
  const invoiceDate = dialog.getByLabel('Rechnungsdatum', { exact: true }); const paymentTerm = dialog.getByLabel('Zahlungsziel', { exact: true });
  await expect(paymentTerm).toHaveValue(await invoiceDate.inputValue());
  await invoiceDate.fill(addDays(await invoiceDate.inputValue(), 1)); await expect(paymentTerm).toHaveValue(await invoiceDate.inputValue());
  await dialog.getByRole('button', { name: 'Rechnung erstellen' }).click();
  await expect(dialog.getByRole('heading', { name: /Rechnung \d{4}-001/, level: 2 })).toBeVisible();
  await expect(dialog.locator('.invoice-sheet')).toContainText('Praxis Dr. Muster'); await expect(dialog.locator('.invoice-sheet')).toContainText('Lindenallee 3');
  await expect(dialog.locator('.invoice-sheet')).toContainText('85'); await expect(dialog.locator('.invoice-sheet')).toContainText('dankend erhalten');
  await expect(dialog.locator('.invoice-meta')).toContainText('ZahlungszielSofort');
  await expect(page.locator('#print-root .invoice-sheet')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#print-root .invoice-sheet')).toBeVisible(); await expect(page.locator('#root')).toBeHidden();
  await expect(page.locator('#print-root .invoice-meta')).toContainText('ZahlungszielSofort');
  const pdf = await page.pdf({ format: 'A4' }); if (process.env.SAVE_PDF) await (await import('node:fs/promises')).writeFile(process.env.SAVE_PDF, pdf); expect(pdf.subarray(0, 5).toString()).toBe('%PDF-'); expect(pdf.length).toBeGreaterThan(5000);
  await page.emulateMedia({ media: 'screen' });
  await dialog.getByRole('button', { name: 'Schließen' }).first().click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('.invoice-list').getByRole('button', { name: /^Rechnung öffnen \d{4}-001$/ })).toBeVisible();
  await page.locator('.finance-history > summary').click();

  await page.getByRole('button', { name: 'Einnahmen als CSV (Steuerberatung)' }).click();
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: /Einnahmen als CSV.*\d{4}/ }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv).toMatch(/Zahlungsdatum;Termindatum;Klient;Rechnung;Euro-Vergleich \(EUR\)/); expect(csv).toContain('Klient 1'); expect(csv).toContain(';85;85;EUR;'); expect(csv).not.toContain('Mustermann');

  await page.keyboard.press('Control+k');
  await dialog.getByLabel('Alles durchsuchen').fill('grubeln schlaf');
  await expect(dialog.locator('.search-results mark').first()).toBeVisible();
  await dialog.locator('.search-results button').first().click();
  await expect(page.getByRole('heading', { name: 'Max Mustermann' }).first()).toBeVisible();
  expect(problems).toEqual([]);
});
