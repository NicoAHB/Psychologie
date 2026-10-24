import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
import { today } from '../../src/lib/dates';
import { uid } from '../../src/lib/types';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
test('quick completion is one payment and survives lock and reload with its selected method', async ({ page }) => {
  const { data, client } = workflowData(); data.appointments.push({ id: uid(), clientId: client.id, date: today(), time: '12:00', duration: 50, feeCents: 8500, billing: { currency: 'UAH', amountCents: 409100, rate: data.settings.exchangeRate }, timeZone: 'Europe/Berlin', reminderId: uid(), status: 'scheduled' });
  const read = await seedWorkflow(page, data); await nav(page, de.appointments);
  await page.getByLabel(de.quickPaymentMethod, { exact: true }).selectOption('cash');
  await page.getByRole('button', { name: de.quickCompletePaid, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: de.quickPaymentSaved })).toBeVisible();
  const stored = await read(); const payment = stored.sessions.at(-1)!; expect(payment.paymentMethod).toBe('cash'); expect(payment.paidAt).toBe(today()); expect(payment.billing?.amountCents).toBe(409100);
  await page.getByRole('button', { name: de.lock, exact: true }).last().click(); await page.reload(); await unlock(page);
  expect((await read()).sessions.find(s => s.id === payment.id)?.paymentMethod).toBe('cash');
});
test('setup links focus their exact settings and help is accessible without a mouse', async ({ page }) => {
  const { data } = workflowData(); await seedWorkflow(page, data);
  const checklist = page.locator('.setup-checklist'); await expect(checklist).toBeVisible();
  await checklist.getByRole('button', { name: new RegExp('^'+de.setupBanks) }).click(); await expect(page.locator('#settings-banks')).toBeFocused();
  await nav(page, de.overview); const help = checklist.getByRole('button', { name: de.helpAbout.replace('{topic}', de.setupTitle), exact: true });
  await help.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toContainText(de.helpSetup);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); expect(result.violations).toEqual([]);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
for (const width of [820,390]) test(`large device-local text remains readable at ${width}px in both themes`, async ({ page }) => {
  test.setTimeout(90000);
  // Set the CSS viewport before navigation, like the existing portrait tests.
  // WebKit's iOS emulation can retain its prior layout viewport across two live device-width resizes.
  await page.setViewportSize({ width,height:1180 }); const { data } = workflowData(); await seedWorkflow(page, data);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  {
    await nav(page, de.settings);
    await page.getByLabel(de.fontSize, { exact: true }).selectOption('extraLarge');
    for (const mode of ['light','dark']) {
      await page.getByLabel(de.colorScheme, { exact: true }).selectOption(mode);
      const layout = await page.evaluate(() => ({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth, font:document.documentElement.dataset.fontSize, theme:document.documentElement.dataset.theme,
        overflowing:Array.from(document.querySelectorAll('main *, .topbar *')).filter(node=>{const r=node.getBoundingClientRect();return r.width>0 && r.right>innerWidth+1;}).slice(0,12).map(node=>({html:node.outerHTML.slice(0,180),right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width})) }));
      expect(layout.scrollWidth,JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); expect(result.violations).toEqual([]);
      await nav(page, de.overview); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await nav(page, de.settings);
    }
  }
  await page.getByRole('button',{name:de.backupAssistant,exact:true}).click();
  const dialog=page.getByRole('dialog'); await dialog.getByRole('button',{name:'Українська',exact:true}).click();
  await expect(dialog).toHaveAccessibleName(uk.backupAssistant);
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await dialog.getByRole('button',{name:'Deutsch',exact:true}).click(); await dialog.getByRole('button',{name:de.close,exact:true}).click();
  await page.reload(); await unlock(page); await expect(page.locator('html')).toHaveAttribute('data-font-size','extraLarge');
  const state = await page.evaluate(() => localStorage.getItem('praxisraum-appearance')); expect(state).toContain('extraLarge');
});
