import { test as base } from '@playwright/test';
export { expect, type Page } from '@playwright/test';
/** Browser tests stay deterministic and never depend on the central bank's uptime. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://bank.gov.ua/**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ r030: 978, cc: 'EUR', rate: 48.1256, exchangedate: new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/Kyiv' }).replaceAll('/', '.') }]),
    }));
    await use(page);
  },
});
