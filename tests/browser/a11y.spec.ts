import AxeBuilder from '@axe-core/playwright';
import { fakeMemoCapture } from './memo-fixture';
import { test, expect, type Page } from './fixtures';

const nav = async (page: Page, name: string) => {
  const menu = page.getByRole('button', { name: 'Navigation öffnen' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
};

/** Collects every violation of a view; one run then lists everything that needs fixing. */
async function scan(page: Page, found: Record<string, string[]>, view: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const lines = result.violations.map(v => `${v.id}: ${v.nodes.slice(0, 4).map(n => n.target.join(' ')).join(' | ')}`);
  if (lines.length) found[view] = lines;
}

for (const theme of ['light', 'dark'] as const) {
  test(`no detectable accessibility violations in ${theme} mode`, async ({ page }) => {
    test.setTimeout(90000);
    await fakeMemoCapture(page);
    await page.addInitScript(t => { try { localStorage.setItem('praxisraum-theme', t); localStorage.setItem('praxisraum-language', 'de'); } catch { /* storage may be blocked */ } }, theme);
    const found: Record<string, string[]> = {};
    await page.goto('/');
    await scan(page, found, 'welcome');
    await page.getByRole('button', { name: 'Mit Beispieldaten entdecken' }).click();
    await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
    await scan(page, found, 'overview');
    await nav(page, 'Klienten');
    await page.locator('.directory-list button').first().click();
    for (const tab of ['Überblick', 'Besprochen', 'Fragebögen', /Dokumente/, 'Finanzen']) {
      await page.getByRole('tab', { name: tab }).click();
      await scan(page, found, `client ${tab}`);
    }
    for (const route of ['Termine', 'Finanzen', 'Einstellungen']) {
      await nav(page, route);
      await scan(page, found, route);
    }
    await nav(page, 'Termine');
    await page.getByRole('button', { name: 'Woche', exact: true }).click();
    await scan(page, found, 'week view');
    await page.getByRole('button', { name: 'Termin anlegen', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await scan(page, found, 'appointment form');
    await page.keyboard.press('Escape');
    await nav(page, 'Klienten');
    await page.getByRole('button', { name: 'Sitzung erfassen', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await scan(page, found, 'session form');
    await page.getByRole('dialog').getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).click();
    const recorder = page.getByRole('dialog', { name: 'Sprach-Memo aufnehmen', exact: true });
    await scan(page, found, 'memo recorder idle');
    await recorder.getByRole('button', { name: 'Aufnahme starten', exact: true }).click();
    await expect(recorder.getByRole('status')).toContainText('Aufnahme läuft');
    await scan(page, found, 'memo recorder recording');
    await recorder.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
    await recorder.getByLabel('Bezeichnung (optional)', { exact: true }).fill('Barrierefreies Memo');
    await recorder.getByLabel('Kurzfassung', { exact: true }).fill('Manuell erfasste Gedanken zur Sitzung.');
    await scan(page, found, 'memo recorder preview');
    await recorder.getByRole('button', { name: 'Memo übernehmen', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
    await scan(page, found, 'session memo list');
    await page.locator('.memo-open').filter({ hasText: 'Barrierefreies Memo' }).click();
    const memo = page.getByRole('dialog', { name: 'Barrierefreies Memo', exact: true });
    await expect(memo.getByRole('slider', { name: 'Wiedergabeposition', exact: true })).toBeVisible();
    await scan(page, found, 'memo playback');
    await memo.getByRole('button', { name: 'Bezeichnung / Kurzfassung bearbeiten', exact: true }).click();
    await scan(page, found, 'memo manual summary form');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Profil bearbeiten' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await scan(page, found, 'client profile form');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Videosprechstunde/ }).first().click();
    await expect(page.getByRole('dialog', { name: /Videosprechstunde/ })).toBeVisible(); // a dialog announces its title to screen readers
    await scan(page, found, 'video consultation');
    expect(found).toEqual({});
  });
}

test('keyboard users can skip the navigation and every page has its own title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Praxisraum');
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  await expect(page).toHaveTitle('Übersicht · Praxisraum');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main-content');
  await nav(page, 'Termine');
  await expect(page).toHaveTitle('Termine · Praxisraum');
});

test('an unexpected rendering error shows a bilingual recovery page instead of a blank screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(Intl.NumberFormat.prototype, 'format', { get() { throw new Error('simulated failure'); } }); });
  await page.getByRole('button', { name: 'Українська' }).first().click();
  const alert = page.getByRole('alert').filter({ hasText: 'Etwas ist schiefgelaufen.' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Щось пішло не так.');
  await expect(alert.getByRole('button', { name: /Neu laden/ })).toBeVisible();
});

test('tablet in portrait keeps appointment names readable and the page free of sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken' }).click();
  await nav(page, 'Termine');
  const person = page.locator('.appointments-card .appointment-person').first();
  await expect(person).toBeVisible();
  expect((await person.boundingBox())!.width).toBeGreaterThan(200);
  await expect(person.locator('strong')).not.toHaveText(/…|\.\.\./);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [820, 390]) test(`voice memo controls fit ${width}px portrait without sideways scrolling`, async ({ page }) => {
  await fakeMemoCapture(page); await page.setViewportSize({ width, height: 1180 });
  await page.goto('/'); await page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true }).click();
  await nav(page, 'Klienten'); await page.locator('.directory-list button').first().click();
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
  await page.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sprach-Memo aufnehmen', exact: true });
  await dialog.getByRole('button', { name: 'Aufnahme starten', exact: true }).click(); await dialog.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  await dialog.getByLabel('Bezeichnung (optional)', { exact: true }).fill('Дуже довга назва '.repeat(7));
  await dialog.getByLabel('Kurzfassung', { exact: true }).fill('Ручний текст без пробілів'.replaceAll(' ', '').repeat(50));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const slider = dialog.getByRole('slider', { name: 'Wiedergabeposition', exact: true });
  expect((await slider.boundingBox())!.width).toBeGreaterThan(200);
  await dialog.getByRole('button', { name: 'Memo übernehmen', exact: true }).click();
  const row = page.locator('.memo-open').first(); await expect(row).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await row.boundingBox())!.width).toBeGreaterThan(200);
});
