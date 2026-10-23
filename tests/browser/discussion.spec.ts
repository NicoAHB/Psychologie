import { nav } from './workflow-fixture';
import { test, expect, type Page } from './fixtures';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAZElEQVR4nO3PQQ3AIADAQMC/CxJMYG4ieFyW9BS0c98z/mzpgFcNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaB+DmAKEfrnO0QAAAABJRU5ErkJggg==', 'base64');

const storedImages = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('praxisraum', 1); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
  return await new Promise<number>(resolve => { const request = db.transaction('blobs', 'readonly').objectStore('blobs').count(); request.onsuccess = () => resolve(request.result); });
});
test('what we discussed: typed notes, photos of the handwritten sheet, homework, next topics, all at a glance', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const problems: string[] = []; page.on('pageerror', e => problems.push(e.message)); page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase'); await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible();
  const dialog = page.getByRole('dialog');
  await nav(page, 'Klienten'); await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click();
  await dialog.getByLabel('Name *', { exact: true }).fill('Anna Gespräch'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();

  const glance = page.getByRole('region', { name: 'Auf einen Blick' });
  await expect(glance).toContainText('Kein Termin geplant'); await expect(glance).toContainText('Noch keine Termin'); await expect(page.getByText('Keine offenen Hausaufgaben.')).toBeVisible();
  await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click(); await dialog.getByLabel('Datum *').fill(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)); await dialog.getByLabel('Uhrzeit *').fill('16:30');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(glance).toContainText('16:30');

  await page.getByRole('button', { name: 'Termin nachtragen', exact: true }).click();
  await dialog.getByLabel('Terminnotiz (optional)').fill('Wir sprachen über Schlafprobleme und Grübeln am Abend.');
  await dialog.locator('input[type=file]').nth(1).setInputFiles([{ name: 'seite1.png', mimeType: 'image/png', buffer: PNG }, { name: 'seite2.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(dialog.getByRole('list', { name: 'Angehängte Fotos' }).locator('li')).toHaveCount(2);
  await dialog.getByLabel('Hausaufgabe für den Klienten').fill('Schlaftagebuch führen');
  await dialog.getByLabel('Für das nächste Mal besprechen').fill('Atemübung vor dem Schlafen besprechen');
  await dialog.getByLabel('Themen-Tags').fill('#Schlaf');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect.poll(() => storedImages(page)).toBe(2);

  await expect(glance).toContainText('Letzte Termin'); await expect(glance).not.toContainText('Noch keine Termin');
  await expect(page.getByRole('textbox', { name: 'Vorbereitung für den nächsten Termin' })).toHaveValue('Atemübung vor dem Schlafen besprechen');
  await expect(page.locator('.homework-list')).toContainText('Schlaftagebuch führen');
  await expect(page.locator('.recent-list')).toContainText('Schlafprobleme'); await expect(page.locator('.recent-list')).toContainText('2 Foto(s)');
  await expect(page.getByText('#Schlaf · 1')).toBeVisible();
  await page.getByRole('button', { name: 'Als Nachricht kopieren' }).click(); await expect(page.getByText('Nachricht kopiert')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Hausaufgabe bis zu unserem nächsten Termin:\nSchlaftagebuch führen\n\nNächster Termin: .*16:30 Uhr \(Berlin, UTC\+[12]\)\.$/);

  await page.getByRole('tab', { name: 'Besprochen' }).click();
  await expect(page.locator('.timeline-entry').first().locator('.note-thumbnail')).toHaveCount(2);
  await expect(page.locator('.homework-note')).toContainText('Schlaftagebuch führen');
  await page.locator('.timeline-entry .note-thumbnail').first().click(); await expect(dialog.locator('img')).toBeVisible(); await dialog.getByRole('button', { name: 'Schließen' }).first().click();

  // The next session starts with a review of the last homework; the new one replaces it in the open list.
  await page.getByRole('button', { name: 'Termin nachtragen', exact: true }).click();
  await expect(dialog.getByText('Hausaufgabe der letzten Termin')).toBeVisible(); await expect(dialog.locator('.previous-homework')).toContainText('Schlaftagebuch führen');
  await expect(dialog.getByLabel('Für das nächste Mal besprechen')).toHaveValue('Atemübung vor dem Schlafen besprechen');
  await dialog.locator('.previous-homework').getByLabel('Erledigt / besprochen').check();
  await dialog.getByLabel('Uhrzeit', { exact: true }).fill('11:00'); await dialog.getByLabel('Terminnotiz (optional)').fill('Tagebuch besprochen'); await dialog.getByLabel('Hausaufgabe für den Klienten').fill('Spaziergang nach dem Abendessen');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: 'Überblick' }).click();
  await expect(page.locator('.homework-list li')).toHaveCount(1); await expect(page.locator('.homework-list')).toContainText('Spaziergang');

  // Removing a photo updates shared references; deleting the session retains its remaining photo in encrypted history.
  await page.getByRole('tab', { name: 'Besprochen' }).click();
  await page.getByRole('button', { name: 'Termin bearbeiten' }).nth(1).click();
  await dialog.getByRole('button', { name: 'Foto entfernen' }).first().click(); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect.poll(() => storedImages(page)).toBe(1);
  await page.getByRole('button', { name: 'Termin bearbeiten' }).nth(1).click(); await dialog.getByRole('button', { name: 'Termin löschen' }).click(); await expect(dialog).not.toBeVisible();
  await expect.poll(() => storedImages(page)).toBe(1);
  await nav(page, 'Einstellungen'); await page.getByRole('button', { name: 'Verlauf löschen', exact: true }).click(); await expect.poll(() => storedImages(page)).toBe(0);

  // Everything typed is searchable, including homework.
  await page.keyboard.press('Control+k'); await dialog.getByLabel('Alles durchsuchen').fill('spaziergang'); await expect(dialog.locator('.search-results mark').first()).toBeVisible();
  expect(problems).toEqual([]);
});
