import { test, expect, type Page } from '@playwright/test';
async function nav(page: Page, text: string) {
  await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: text, exact: true }).click();
}
async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase'); await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
}
async function addClient(page: Page, name: string) {
  const dialog = page.getByRole('dialog');
  await nav(page, 'Klienten'); await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click();
  await dialog.getByLabel('Name *', { exact: true }).fill(name); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
}
test('automatic backup file follows every change and stays encrypted; the reminder banner goes away after a copy', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'File System Access is a desktop feature.');
  await page.addInitScript(() => {
    const w = window as unknown as { __written: string[]; showSaveFilePicker: () => Promise<unknown> };
    w.__written = [];
    w.showSaveFilePicker = async () => ({ name: 'praxisraum-auto.encrypted.json', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      createWritable: async () => { let text = ''; return { write: async (data: string) => { text += data; }, close: async () => { w.__written.push(text); } }; } });
  });
  await setup(page); await addClient(page, 'Sichtbarer Klientenname');
  await nav(page, 'Übersicht'); await expect(page.getByText('Es gibt noch keine Sicherung außerhalb dieses Geräts')).toBeVisible();
  await nav(page, 'Einstellungen'); await page.getByRole('button', { name: 'Sicherungsdatei wählen' }).click();
  await expect(page.getByText('praxisraum-auto.encrypted.json')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __written: string[] }).__written.length)).toBeGreaterThan(0);
  await addClient(page, 'Zweiter Klient');
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __written: string[] }).__written)).length, { timeout: 15000 }).toBeGreaterThan(1);
  const written = await page.evaluate(() => (window as unknown as { __written: string[] }).__written);
  const last = JSON.parse(written.at(-1)!); expect(last.type).toBe('praxisraum-backup-v1'); expect(last.envelope.format).toBe('praxisraum-v2');
  expect(written.at(-1)).not.toContain('Klientenname'); expect(written.at(-1)).not.toContain('Zweiter');
  await nav(page, 'Übersicht'); await expect(page.getByText('Es gibt noch keine Sicherung außerhalb dieses Geräts')).toHaveCount(0);
});
test('banner offers a download copy and disappears afterwards', async ({ page }) => {
  await setup(page); await addClient(page, 'Banner Test'); await nav(page, 'Übersicht');
  await expect(page.getByText('Es gibt noch keine Sicherung außerhalb dieses Geräts')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Jetzt sichern' }).first().click(); await download;
  await expect(page.getByText('Es gibt noch keine Sicherung außerhalb dieses Geräts')).toHaveCount(0);
});
test('version history brings back a deleted session; deleting a whole client wipes the history', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await setup(page); await addClient(page, 'Verlauf Person');
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Sitzung erfassen', exact: true }).click();
  await dialog.getByLabel('Sitzungsnotiz (optional)').fill('Wichtige Notiz, die verschwindet'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Sitzung bearbeiten' }).click(); await dialog.getByRole('button', { name: 'Sitzung löschen' }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Wichtige Notiz, die verschwindet')).toHaveCount(0);
  await nav(page, 'Einstellungen');
  await expect(page.getByText('Vor einer Löschung').first()).toBeVisible();
  await page.locator('.passkey-list li', { hasText: 'Vor einer Löschung' }).first().getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.getByText('Stand wiederhergestellt.')).toBeVisible();
  await nav(page, 'Klienten'); const entry = page.locator('.directory-list').getByRole('button', { name: /Verlauf Person/ }); if (await entry.isVisible()) await entry.click();
  await expect(page.getByText('Wichtige Notiz, die verschwindet')).toBeVisible();
  // Erasing a client leaves no undo copy of their data behind.
  await page.getByRole('button', { name: 'Profil bearbeiten' }).click(); await dialog.getByRole('button', { name: 'Klient löschen' }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Einstellungen'); await expect(page.getByText('Noch keine früheren Stände.')).toBeVisible();
});
