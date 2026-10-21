import { test, expect, type Page } from '@playwright/test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAZElEQVR4nO3PQQ3AIADAQMC/CxJMYG4ieFyW9BS0c98z/mzpgFcNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaB+DmAKEfrnO0QAAAABJRU5ErkJggg==', 'base64');
async function nav(page: Page, text: string) {
  await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: text, exact: true }).click();
}
// On narrow screens an open profile replaces the client list.
async function openProfile(page: Page) {
  const entry = page.locator('.directory-list').getByRole('button', { name: /Löschtest Person/ });
  if (await entry.isVisible()) await entry.click();
}
const storedImages = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('praxisraum', 1); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
  return await new Promise<number>(resolve => { const request = db.transaction('blobs', 'readonly').objectStore('blobs').count(); request.onsuccess = () => resolve(request.result); });
});

test('records can be corrected and erased: sessions, photo notes, appointments and whole clients, including their encrypted images', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (/Content Security Policy|violates/i.test(m.text())) problems.push(m.text()); });
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase');
  await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  const dialog = page.getByRole('dialog');

  await nav(page, 'Klienten'); await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click();
  await dialog.getByLabel('Name *', { exact: true }).fill('Löschtest Person');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible(); expect(await storedImages(page)).toBe(1);

  // Replacing the profile picture erases the old encrypted image.
  await page.getByRole('button', { name: 'Profil bearbeiten' }).click();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'avatar2.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect.poll(() => storedImages(page)).toBe(1);

  // The preparation text is written after a typing pause and survives locking right away.
  const preparation = page.getByRole('textbox', { name: 'Vorbereitung für die nächste Sitzung' });
  await preparation.fill('Kurz vor dem Sperren getippt');

  await page.getByRole('button', { name: 'Sitzung erfassen', exact: true }).click();
  await dialog.getByLabel('Sitzungsnotiz (optional)').fill('Erster Entwurf');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Erster Entwurf')).toBeVisible();
  await page.getByRole('button', { name: 'Sitzung bearbeiten' }).click();
  await expect(dialog.getByLabel('Sitzungsnotiz (optional)')).toHaveValue('Erster Entwurf');
  await dialog.getByLabel('Sitzungsnotiz (optional)').fill('Korrigierte Notiz');
  await dialog.getByLabel('Themen-Tags').fill('#Korrektur');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Korrigierte Notiz')).toBeVisible(); await expect(page.getByText('Erster Entwurf')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '#Korrektur' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Fotonotiz hinzufügen' }).click();
  await dialog.getByLabel('Foto der Notiz', { exact: true }).setInputFiles({ name: 'note.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect.poll(() => storedImages(page)).toBe(2);
  await page.getByRole('button', { name: 'Fotonotiz löschen' }).click();
  await expect(page.getByRole('button', { name: 'Fotonotiz löschen' })).toHaveCount(0); await expect.poll(() => storedImages(page)).toBe(1);

  await page.getByRole('button', { name: 'Sitzung bearbeiten' }).click();
  await dialog.getByRole('button', { name: 'Sitzung löschen' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Korrigierte Notiz')).toHaveCount(0);

  // Overlapping appointments are flagged but not forbidden; appointments can be rescheduled.
  await nav(page, 'Termine'); await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click();
  await dialog.getByLabel('Uhrzeit *').fill('10:00'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click();
  await dialog.getByLabel('Uhrzeit *').fill('10:30');
  await expect(dialog.getByText('Überschneidung mit einem anderen Termin')).toBeVisible();
  await dialog.getByLabel('Uhrzeit *').fill('11:00');
  await expect(dialog.getByText('Überschneidung mit einem anderen Termin')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Termin bearbeiten' }).first().click();
  await dialog.getByLabel('Uhrzeit *').fill('15:45'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(page.getByText('15:45', { exact: true })).toBeVisible();

  // Locking right after typing must not lose the last words.
  await nav(page, 'Klienten'); await openProfile(page);
  await expect(preparation).toHaveValue('Kurz vor dem Sperren getippt');
  await preparation.fill('Letzte Worte direkt vor dem Sperren');
  await page.getByRole('button', { name: 'Sperren', exact: true }).last().click();
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Praxisraum öffnen', exact: true }).click();
  await nav(page, 'Klienten'); await openProfile(page);
  await expect(preparation).toHaveValue('Letzte Worte direkt vor dem Sperren');

  await page.getByRole('button', { name: 'Profil bearbeiten' }).click();
  await dialog.getByRole('button', { name: 'Klient löschen' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Löschtest Person')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ihre erste Begleitung beginnt hier' }).first()).toBeVisible();
  await expect.poll(() => storedImages(page)).toBe(0);
  await nav(page, 'Termine'); await expect(page.getByRole('heading', { name: 'Raum für neue Gespräche' })).toBeVisible();
  expect(problems).toEqual([]);
});
