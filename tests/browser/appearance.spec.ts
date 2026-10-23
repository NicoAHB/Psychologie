import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './fixtures';
import { nav } from './workflow-fixture';
import { auroraContrastIssues } from './appearance-contrast';

async function demo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true }).click();
  await nav(page, 'Einstellungen');
}
async function surface(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(node => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, blur: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'), opacity: style.opacity };
  });
}

test('pastel and independent glass controls apply live, survive locking and reload, translate and reset', async ({ page }) => {
  await demo(page);
  const settings = page.locator('.appearance-settings');
  await settings.getByRole('radio', { name: 'Sand & Rosé', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-background-palette', 'sandRose');
  const cards = settings.getByRole('slider', { name: 'Transparenz der Inhaltskarten', exact: true });
  const menus = settings.getByRole('slider', { name: 'Transparenz der Menüs', exact: true });
  await cards.focus(); await cards.press('End');
  await menus.focus(); await menus.press('Home');
  await settings.getByRole('slider', { name: 'Weichzeichnung der Glasflächen', exact: true }).press('End');
  await expect(cards).toHaveValue('30'); await expect(menus).toHaveValue('0');
  expect((await surface(page, '.appearance-settings')).background).toBe('rgba(255, 255, 255, 0.7)');
  expect((await surface(page, '.topbar')).background).toBe('rgb(250, 252, 250)');
  expect((await surface(page, '.appearance-settings')).blur).toBe('blur(28px)');
  expect((await surface(page, '.appearance-settings')).opacity).toBe('1');
  await page.getByRole('button', { name: 'Українська', exact: true }).first().click();
  await expect(settings.getByRole('radio', { name: 'Пісок та рожевий', exact: true })).toBeChecked();
  await expect(settings.getByRole('slider', { name: 'Прозорість карток вмісту', exact: true })).toHaveValue('30');
  await page.getByRole('button', { name: 'Deutsch', exact: true }).first().click();
  // Preferences are independent of the vault, including demo lock/reload.
  await page.getByRole('button', { name: 'Sperren', exact: true }).last().click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-background-palette', 'sandRose');
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true }).click(); await nav(page, 'Einstellungen');
  await expect(cards).toHaveValue('30'); await expect(menus).toHaveValue('0');
  await settings.getByRole('radio', { name: 'Eigene Farben', exact: true }).check();
  await settings.getByLabel('Hintergrundfarbe 1', { exact: true }).fill('#0000ff');
  await expect(settings.getByLabel('Hintergrundfarbe 1', { exact: true })).toHaveValue('#d2d2ff');
  await settings.getByRole('radio', { name: 'Ohne Verlauf', exact: true }).check();
  expect(await page.locator('.app-aurora').evaluate(node => getComputedStyle(node, '::before').opacity)).toBe('0');
  await settings.getByRole('button', { name: 'Darstellung zurücksetzen', exact: true }).click();
  await expect(settings.getByRole('radio', { name: 'Salbei & Blau', exact: true })).toBeChecked();
  await expect(cards).toHaveValue('12'); await expect(menus).toHaveValue('12');
});

for (const theme of ['light', 'dark']) test(`maximum transparency keeps settings and dashboard accessible in ${theme} mode`, async ({ page }, info) => {
  test.setTimeout(90000);
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 820, height: 1180 });
  await page.addInitScript(theme => {
    localStorage.setItem('praxisraum-theme', theme);
    localStorage.setItem('praxisraum-appearance', JSON.stringify({ version: 1, palette: 'custom', color1: '#000000', color2: '#ff0000', intensity: 100, cardTransparency: 30, menuTransparency: 30, glassBlur: 28 }));
  }, theme);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true })).toBeVisible();
  expect(await auroraContrastIssues(page, theme)).toEqual([]);
  await page.getByRole('button', { name: 'Mit Beispieldaten entdecken', exact: true }).click();
  await nav(page, 'Einstellungen');
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const found: Record<string, string[]> = {};
  for (const route of ['Einstellungen', 'Übersicht', 'Klienten', 'Finanzen', 'Newsletter']) {
    if (route !== 'Einstellungen') await nav(page, route);
    if (route === 'Klienten') await page.locator('.directory-list button').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await auroraContrastIssues(page, theme), route).toEqual([]);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    if (result.violations.length) found[route] = result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
    await page.bringToFront();
  }
  expect(found).toEqual({});
});

test('reduced transparency uses opaque panels and print keeps the aurora off paper', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'Chromium media emulation');
  await demo(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  expect((await surface(page, '.appearance-settings')).background).toBe('rgb(255, 255, 255)');
  expect((await surface(page, '.appearance-settings')).blur).toBe('none');
  expect((await surface(page, '.topbar')).background).toBe('rgb(250, 252, 250)');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.app-aurora')).toBeHidden();
});
