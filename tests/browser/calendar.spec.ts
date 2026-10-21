import { test, expect, type Page } from './fixtures';
import { readFile } from 'node:fs/promises';
async function nav(page: Page, text: string) {
  await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: text, exact: true }).click();
}
test('a client in Ukraine: both local times are shown everywhere, series, week view, copy text and calendar files', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const problems: string[] = []; page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (/Content Security Policy|violates/i.test(m.text())) problems.push(m.text()); });
  await page.goto('/');
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase');
  await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  const dialog = page.getByRole('dialog');

  await nav(page, 'Klienten'); await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click();
  await dialog.getByLabel('Name *', { exact: true }).fill('Olena Kowalenko');
  await dialog.getByLabel('Zeitzone des Klienten').selectOption('Europe/Kyiv');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();

  await nav(page, 'Termine'); await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click();
  await dialog.getByLabel('Uhrzeit *').fill('18:00');
  const both = dialog.locator('.dual-time');
  await expect(both.locator('.dual-cell').first()).toContainText('Praxis · DE'); await expect(both.locator('.dual-cell').first()).toContainText('18:00 Uhr'); await expect(both.locator('.dual-cell').first()).toContainText(/Berlin, Deutschland · UTC\+[12]/);
  await expect(both.locator('.dual-cell').nth(1)).toContainText('Klient · UA'); await expect(both.locator('.dual-cell').nth(1)).toContainText('19:00 Uhr'); await expect(both.locator('.dual-cell').nth(1)).toContainText(/Kiew, Ukraine · UTC\+[23]/);
  await expect(both).toContainText('Für den Klienten ist der Termin um 19:00 Uhr (Ortszeit Kiew, Ukraine).');
  await dialog.getByLabel('Wiederholung').selectOption('weekly'); await dialog.getByLabel('Anzahl der Termine').fill('3');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  const rows = page.locator('.appointments-card .appointment-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('.time-pair .t-line').nth(0)).toHaveText('18:00DE'); await expect(rows.first().locator('.time-pair .t-line').nth(1)).toHaveText('19:00UA');
  await expect(rows.first()).toContainText(/Für den Klienten: 19:00 Uhr \(Kiew, Ukraine, UTC\+[23]\)/);

  // Entering the time in the client's zone keeps the instant exact for both sides.
  await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click();
  await dialog.getByLabel('Uhrzeit gilt in').selectOption({ index: 1 }); await dialog.getByLabel('Uhrzeit *').fill('09:00');
  await expect(dialog.locator('.dual-cell').first()).toContainText('08:00 Uhr'); await expect(dialog.locator('.dual-cell').nth(1)).toContainText('09:00 Uhr');
  await dialog.getByRole('button', { name: 'Abbrechen' }).click(); await expect(dialog).not.toBeVisible();

  await page.getByRole('button', { name: 'Termintext kopieren' }).first().click();
  await expect(page.getByText('Kopiert')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Ich bestätige unseren Termin: .*, 19:00 Uhr \(Kiew, UTC\+[23]\)\. Zur Orientierung — Berlin: 18:00 Uhr \(UTC\+[12]\)\./);

  const single = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Als Kalenderdatei für den Klienten (.ics)' }).first().click();
  const ics = await readFile((await (await single).path())!, 'utf8');
  expect(ics).toMatch(/BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T\d{6}Z[\s\S]*END:VEVENT/); expect(ics).not.toContain('Olena');

  await page.getByRole('button', { name: 'Kalender exportieren (.ics)' }).click();
  const all = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Ohne Namen (nur „Termin“)' }).click();
  const feed = await readFile((await (await all).path())!, 'utf8');
  expect((feed.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3); expect(feed).not.toContain('Kowalenko');

  await page.getByRole('button', { name: 'Woche', exact: true }).click();
  await expect(page.locator('.week-block').first()).toBeVisible(); await expect(page.locator('.week-block .w2').first()).toContainText(/Klient: 19:00 UA/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Cancelling one appointment of a series offers to cancel the following ones too.
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  const dialogs: string[] = []; page.on('dialog', d => { dialogs.push(d.message()); void d.accept(); });
  await page.getByRole('button', { name: 'Termin absagen' }).first().click();
  await expect.poll(() => dialogs.length).toBe(2); expect(dialogs[1]).toContain('Serie');
  await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the client zone can be set right where the appointment is made, and is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase'); await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  const dialog = page.getByRole('dialog');
  await nav(page, 'Klienten'); await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click();
  await dialog.getByLabel('Name *', { exact: true }).fill('Ukrainisch Sprechend'); await dialog.getByLabel('Erinnerungen auf Ukrainisch senden').check();
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Termine'); await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click();
  await dialog.getByLabel('Uhrzeit *').fill('18:00');
  await expect(dialog.locator('.dual-cell')).toHaveCount(1); await expect(dialog.locator('.dual-cell')).toContainText('Praxis & Klient');
  await expect(dialog.getByText('Lebt er in der Ukraine?')).toBeVisible(); await dialog.getByRole('button', { name: 'Zeitzone Kiew übernehmen' }).click();
  await expect(dialog.locator('.dual-cell')).toHaveCount(2); await expect(dialog.locator('.dual-sentence')).toContainText('19:00 Uhr');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('.appointment-row .time-pair .t-line').nth(1)).toHaveText('19:00UA');
  await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click();
  await expect(dialog.getByLabel('Zeitzone des Klienten')).toHaveValue('Europe/Kyiv'); await expect(dialog.locator('.dual-cell')).toHaveCount(2);
});
