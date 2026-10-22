import AxeBuilder from '@axe-core/playwright';
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
