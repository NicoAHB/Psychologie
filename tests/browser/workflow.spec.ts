import { test, expect } from './fixtures';
import { addDays, today } from '../../src/lib/dates';
import { uid } from '../../src/lib/types';
import { nav, seedWorkflow, workflowData } from './workflow-fixture';

test('corrections create a linked reversal and replacement; the original and clinical notes remain unchanged', async ({ page }) => {
  const { data, invoice } = workflowData(); const original = structuredClone(invoice); const read = await seedWorkflow(page, data);
  await page.locator('.follow-up-invoices').getByRole('button', { name: `Rechnung öffnen ${invoice.number}` }).click(); let dialog = page.locator('dialog[open]').last();
  await dialog.getByRole('button', { name: 'Rechnung korrigieren', exact: true }).click();
  await expect(dialog.getByLabel('Zahlungsziel', { exact: true })).toHaveValue(await dialog.getByLabel('Rechnungsdatum', { exact: true }).inputValue());
  await dialog.getByLabel('Grund der Korrektur / des Stornos').fill('Anschrift und Betrag korrigiert'); await dialog.getByLabel('Name auf der Rechnung').fill('Олена Виправлена'); await dialog.getByLabel('Betrag (UAH)', { exact: true }).first().fill('4200');
  await dialog.getByRole('button', { name: 'Storno und Ersatzrechnung erstellen', exact: true }).click();
  dialog = page.locator('dialog[open]').last(); await expect(dialog.locator('.invoice-sheet')).toContainText('Олена Виправлена'); await expect(dialog.locator('.invoice-sheet')).toContainText(invoice.number); await expect(dialog.locator('.invoice-sheet')).not.toContainText(/EUR|€/);
  await expect(dialog.locator('.invoice-meta')).toContainText('Термін оплатиНегайно');
  const state = await read(); expect(state.invoices).toHaveLength(3); expect(state.invoices[0]).toEqual(original); expect(state.invoices[1].totalCents).toBe(-818200); expect(state.invoices[2].totalCents).toBe(829100); expect(state.sessions[0].feeCents).toBe(8700); expect(state.sessions[0].notes).toBe('Sitzungsnotiz bleibt erhalten');
  await dialog.locator('.invoice-relations').getByRole('button', { name: `Rechnung ${invoice.number}`, exact: true }).click(); await expect(dialog.locator('.notice').filter({ hasText: 'Storniert' }).first()).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Rechnung stornieren', exact: true })).toHaveCount(0);
  await dialog.locator('.notice').getByRole('button', { name: /Stornorechnung/ }).click(); await expect(dialog.locator('.invoice-sheet')).toContainText('Сторнувальний рахунок'); await expect(dialog.locator('.invoice-sheet')).not.toContainText('UA-TEST'); await expect(dialog.locator('.invoice-sheet')).toContainText(/−|-|–/);
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click(); await expect(page.locator('.follow-up-invoices')).toContainText('Keine überfälligen Rechnungen.');
});

test('payment reminders show only unpaid native amounts in client language and disappear after payment', async ({ page }) => {
  const { data, invoice } = workflowData(); data.sessions[0].paidAt = addDays(today(), -30); await seedWorkflow(page, data);
  await page.locator('.follow-up-invoices').getByRole('button').click(); const view = page.locator('dialog[open]').first();
  await view.getByRole('button', { name: /Zahlungserinnerung vorbereiten.*E-Mail/ }).click(); const composer = page.locator('dialog[open]').last();
  await expect(composer.getByLabel('Betreff')).toHaveValue(/Нагадування про оплату/); const body = await composer.getByLabel('Nachricht', { exact: true }).inputValue(); expect(body).toContain('4 091'); expect(body).not.toContain('8 182'); expect(body).not.toMatch(/EUR|€/); await expect(composer.getByLabel('Nachricht', { exact: true })).toHaveAttribute('lang', 'uk');
  await composer.getByRole('button', { name: 'Schließen', exact: true }).last().click(); await view.getByRole('button', { name: /Zahlungserinnerung vorbereiten.*Telegram/ }).click(); await expect(composer.getByLabel('Nachricht', { exact: true })).toHaveValue(/Добрий день/);
  await composer.getByRole('button', { name: 'Schließen', exact: true }).last().click(); await view.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await nav(page, 'Zahlungen'); await page.locator('.finance-history > summary').click(); await page.locator('.finance-records').getByRole('checkbox', { name: 'Als bezahlt markieren' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Zahlung speichern', exact: true }).click();
  await page.locator('.invoice-list').getByRole('button', { name: `Rechnung öffnen ${invoice.number}` }).click(); await expect(view.locator('.invoice-reminder')).toHaveCount(0);
});

test('return overview links to the document, receives files and closes unneeded returns while retaining their history', async ({ page }) => {
  const { data, client } = workflowData(); data.invoices = []; data.sessions = [];
  const make = (title: string, sent: boolean) => ({ id: uid(), clientId: client.id, title, createdAt: `${addDays(today(), -20)}T10:00:00Z`, file: { blobId: uid(), fileName: 'aufgabe.txt', mimeType: 'text/plain', size: 15 }, returnExpected: true, returnDueOn: addDays(today(), -5), deliveries: sent ? [{ id: uid(), recipient: client.email, subject: 'Aufgabe', body: 'Bitte ausfüllen', requestedAt: `${addDays(today(), -20)}T10:00:00Z`, acceptedAt: `${addDays(today(), -20)}T10:01:00Z` }] : [], returns: [] });
  const task = make('Schlafprotokoll', true); const unsent = make('Ressourcenübung', false); data.documents.push(task, unsent); const read = await seedWorkflow(page, data);
  await expect(page.locator('.follow-up-returns')).toContainText('Rückgabe überfällig'); await expect(page.locator('.follow-up-returns')).toContainText('Noch nicht versendet');
  await page.locator('.follow-up-returns').getByRole('button', { name: 'Dokument öffnen: Schlafprotokoll' }).click(); const item = page.locator(`#client-document-${task.id}`); await expect(item).toBeFocused(); await item.getByRole('button', { name: 'Ausgefüllte Datei hinterlegen', exact: true }).click(); const dialog = page.locator('dialog[open]').last();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'ausgefuellt.txt', mimeType: 'text/plain', buffer: Buffer.from('Виконане завдання') }); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(item.locator('.document-returns')).toContainText('Zurückerhalten am'); await expect(item.locator('.document-history')).toContainText('Versendet am');
  await nav(page, 'Heute'); await expect(page.locator('.follow-up-returns li')).toHaveCount(1); await page.locator('.follow-up-returns').getByRole('button', { name: 'Dokument öffnen: Ressourcenübung' }).click(); const remaining = page.locator(`#client-document-${unsent.id}`);
  await remaining.getByRole('button', { name: 'Rücklauf verwalten', exact: true }).click(); await dialog.getByRole('checkbox', { name: 'Rücklauf nicht mehr erforderlich', exact: true }).check(); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await nav(page, 'Heute'); await expect(page.locator('.follow-up-returns')).toContainText('Keine ausstehenden Rückläufe.');
  const stored = await read(); expect(stored.documents).toHaveLength(2); expect(stored.documents[0].returns).toHaveLength(1); expect(stored.documents[0].deliveries).toHaveLength(1); expect(stored.documents[1].returnClosedAt).toBeTruthy();
});
