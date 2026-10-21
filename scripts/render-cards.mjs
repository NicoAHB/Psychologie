// Exact, local typography: no third-party fonts, images, or external requests.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === 'bundled'
  ? undefined : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 2304, height: 1500 }, deviceScaleFactor: 1 });
  await page.setContent(await readFile(new URL('../design/empfehlungskarte.html', import.meta.url), 'utf8'));
  await page.pdf({ path: 'public/empfehlungskarte-DE-UA.pdf', printBackground: true, preferCSSPageSize: true });
  await page.setContent(await readFile(new URL('../design/empfehlungskarte-digital.html', import.meta.url), 'utf8'));
  await page.evaluate(() => document.fonts.ready);
  for (const [language, suffix] of [['de', 'de'], ['uk', 'uk']]) {
    const card = page.locator(`#${language}`);
    const issues = await card.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const portrait = element.querySelector('.portrait').getBoundingClientRect();
      const headline = element.querySelector('.headline');
      const range = document.createRange(); range.selectNodeContents(headline);
      const overlapsPhoto = [...range.getClientRects()].some(rect => rect.right > portrait.left && rect.left < portrait.right && rect.top < portrait.bottom && rect.bottom > portrait.top);
      const outside = [...element.querySelectorAll('h1,h2,p,.portrait')].some(child => {
        const r = child.getBoundingClientRect();
        return r.left < bounds.left || r.right > bounds.right || r.top < bounds.top || r.bottom > bounds.bottom;
      });
      const description = element.querySelector('.description').getBoundingClientRect();
      const identity = element.querySelector('.identity').getBoundingClientRect();
      const footer = element.querySelector('.footer').getBoundingClientRect();
      return { overlapsPhoto, outside, textOverlap: description.bottom > identity.top || identity.bottom > footer.top };
    });
    if (Object.values(issues).some(Boolean)) throw new Error(`${language}: layout validation failed ${JSON.stringify(issues)}`);
    await card.screenshot({ path: `public/empfehlungskarte-digital-${suffix}.png` });
  }
} finally {
  await browser.close();
}
console.log('Created DE/UA print PDF and two digital PNG cards (1080 × 1350).');
