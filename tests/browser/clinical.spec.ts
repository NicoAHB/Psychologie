import { nav } from './workflow-fixture';
import { test, expect } from './fixtures';

test('PHQ-9 with safety flag and trend chart, GAD-7, and session note templates', async ({ page }) => {
  const problems: string[] = []; page.on('pageerror', e => problems.push(e.message)); page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase'); await page.getByLabel('Passphrase wiederholen').fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible();
  const dialog = page.getByRole('dialog');

  await nav(page, 'Einstellungen');
  await page.getByLabel('Name der Vorlage').fill('Meine Vorlage'); await page.getByLabel('Text der Vorlage').fill('Eigener Baustein: ');
  await page.getByRole('button', { name: 'Vorlage speichern' }).click(); await expect(page.locator('.passkey-list li', { hasText: 'Meine Vorlage' })).toBeVisible();

  await nav(page, 'Klienten'); await page.getByRole('button', { name: 'Klient anlegen', exact: true }).first().click();
  await dialog.getByLabel('Name *', { exact: true }).fill('Fragebogen Person'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();

  await page.getByRole('tab', { name: 'Fragebögen' }).click();
  await page.getByRole('button', { name: 'Fragebogen ausfüllen' }).click();
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog.getByText('Bitte alle Fragen beantworten.')).toBeVisible();
  const answer = (item: number, text: string) => dialog.locator('fieldset').nth(item).getByRole('radio', { name: text, exact: true }).check();
  for (let i = 0; i < 8; i++) await answer(i, 'An mehr als der Hälfte der Tage');
  await answer(8, 'An einzelnen Tagen');
  await expect(dialog.locator('.score-line')).toContainText('17 / 27'); await expect(dialog.locator('.score-line')).toContainText('Mittelschwer');
  await expect(dialog.getByText('Item 9')).toBeVisible();
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('img', { name: /Verlauf der Punktwerte/ })).toBeVisible();
  await expect(page.locator('.assessment-group').first()).toContainText('17 / 27');

  await page.getByRole('button', { name: 'Fragebogen ausfüllen' }).click();
  for (let i = 0; i < 9; i++) await answer(i, 'Überhaupt nicht');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('.assessment-group').first()).toContainText('0 / 27'); await expect(page.locator('.assessment-group').first()).toContainText('Veränderung zum Vorwert: −17');
  await expect(page.getByText('Item 9')).toHaveCount(0);

  await page.getByRole('button', { name: 'Fragebogen ausfüllen' }).click();
  await dialog.getByLabel('Fragebögen').selectOption('gad7');
  for (let i = 0; i < 7; i++) await answer(i, 'Beinahe jeden Tag');
  await expect(dialog.locator('.score-line')).toContainText('21 / 21'); await expect(dialog.locator('.score-line')).toContainText('Schwer');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('.assessment-group')).toHaveCount(2);
  await page.getByRole('button', { name: /^Ergebnis löschen: / }).last().click(); await expect(page.locator('.assessment-group')).toHaveCount(1);

  await page.getByRole('button', { name: 'Termin nachtragen', exact: true }).click();
  await dialog.getByLabel('Vorlage einfügen').selectOption({ label: 'Meine Vorlage' });
  await expect(dialog.getByLabel('Terminnotiz (optional)')).toHaveValue('Eigener Baustein: ');
  await dialog.getByLabel('Vorlage einfügen').selectOption({ label: 'SOAP' });
  await expect(dialog.getByLabel('Terminnotiz (optional)')).toHaveValue(/^Eigener Baustein:\n\nS \(Subjektiv\): \nO \(Objektiv\)/);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  expect(problems).toEqual([]);
});
