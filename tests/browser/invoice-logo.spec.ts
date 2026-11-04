import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { test, expect, type Page } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json',import.meta.url),'utf8')) as Record<string,string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json',import.meta.url),'utf8')) as Record<string,string>;
const customPng = await readFile(new URL('../../src/assets/nadiia-mark.png',import.meta.url));
async function scan(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
}
async function createInvoice(page: Page) {
  await nav(page,de.finances); await page.getByRole('button',{name:de.createInvoice,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:de.createInvoice,exact:true}).click();
  const dialog=page.getByRole('dialog'); await expect(dialog.locator('.invoice-sheet')).toBeVisible(); return dialog;
}
async function pdfImages(page: Page) {
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('dialog').getByRole('button',{name:de.invoiceDownload,exact:true}).click()]);
  const bytes=await readFile((await download.path())!); const pdf=await PDFDocument.load(bytes);
  return { count:pdf.getPage(0).node.Resources()!.lookupMaybe(PDFName.of('XObject'),PDFDict)?.keys().length??0,bytes };
}
for(const enabled of [true,false])test(`new invoices preserve the ${enabled?'enabled':'disabled'} built-in logo in preview, print and offline PDF`,async({page,context})=>{
  test.setTimeout(90000); const {data}=workflowData();data.invoices=[];for(const session of data.sessions)delete session.invoiceId;
  const read=await seedWorkflow(page,data);await nav(page,de.settings);const practice=page.locator('#settings-practice');
  await expect(practice.getByLabel(de.invoiceLogoEnabled,{exact:true})).toBeChecked();
  if(!enabled){await practice.getByLabel(de.invoiceLogoEnabled,{exact:true}).uncheck();await practice.getByRole('button',{name:de.save,exact:true}).click();await expect.poll(async()=>(await read()).settings.invoiceLogo?.enabled).toBe(false);}
  const dialog=await createInvoice(page);expect((await read()).invoices[0].logo).toEqual({enabled,source:'nadiia'});
  await expect(dialog.locator('.invoice-logo-display img')).toHaveCount(enabled?1:0);await expect(page.locator('#print-root .invoice-logo-display img')).toHaveCount(enabled?1:0);
  if(enabled)await expect.poll(()=>dialog.locator('.invoice-logo-display img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1774);
  await scan(page);await page.screenshot({path:`/tmp/nadiia-invoice-${enabled}-${test.info().project.name}.png`});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await context.setOffline(true);
  const result=await pdfImages(page);expect(result.count>0).toBe(enabled);await context.setOffline(false);
  await dialog.locator('.modal-heading').getByRole('button',{name:de.close,exact:true}).click();await page.getByRole('button',{name:de.lock,exact:true}).last().click();await page.reload();await unlock(page);
  expect((await read()).settings.invoiceLogo?.enabled).toBe(enabled);expect((await read()).invoices[0].logo?.enabled).toBe(enabled);
});

test('a custom PNG is encrypted, remains on its issued invoice after replacement and restores from a full backup',async({page,browser})=>{
  test.setTimeout(150000);await page.setViewportSize({width:820,height:1180});
  await page.addInitScript(()=>{const original=URL.revokeObjectURL.bind(URL);const recorded:string[]=[];(window as unknown as {__logoRevoked:string[]}).__logoRevoked=recorded;URL.revokeObjectURL=value=>{recorded.push(value);original(value);};});
  const {data}=workflowData();data.invoices=[];for(const session of data.sessions)delete session.invoiceId;const read=await seedWorkflow(page,data);
  await nav(page,de.settings);const practice=page.locator('#settings-practice');
  await practice.getByLabel(de.invoiceLogoUpload,{exact:true}).setInputFiles({name:'my-practice.png',mimeType:'image/png',buffer:customPng});
  await expect(practice.locator('.invoice-logo-custom img')).toBeVisible();await expect.poll(()=>practice.locator('.invoice-logo-custom img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1254);
  await practice.getByRole('button',{name:de.save,exact:true}).click();await expect(practice.getByRole('button',{name:/^Gespeichert um /})).toBeDisabled();
  const logo=(await read()).settings.invoiceLogo!;expect(logo.source).toBe('custom');if(logo.source!=='custom')throw new Error('Missing test logo');
  const stored=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('praxisraum',1);r.onsuccess=()=>resolve(r.result);});return new Promise<unknown[]>(resolve=>{const r=db.transaction('blobs').objectStore('blobs').getAll();r.onsuccess=()=>{db.close();resolve(r.result);};});});
  expect(stored).toHaveLength(1);expect(JSON.stringify(stored)).not.toMatch(/my-practice|iVBORw0KGgo/);expect(stored[0]).toHaveProperty('payload');
  await scan(page);let dialog=await createInvoice(page);const image=dialog.locator('.invoice-logo-custom img');await expect(image).toBeVisible();const originalUrl=await image.getAttribute('src');expect(originalUrl).toMatch(/^blob:/);expect((await pdfImages(page)).count).toBeGreaterThan(0);
  await dialog.locator('.modal-heading').getByRole('button',{name:de.close,exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {__logoRevoked:string[]}).__logoRevoked)).toContain(originalUrl);
  await nav(page,de.settings);await practice.getByRole('button',{name:de.invoiceLogoReset,exact:true}).click();await practice.getByRole('button',{name:de.save,exact:true}).click();await expect.poll(async()=>(await read()).settings.invoiceLogo?.source).toBe('nadiia');expect((await read()).invoices[0].logo).toEqual(logo);
  const card=page.locator('#settings-backup');const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:de.exportBackup,exact:true}).click()]);const backup=await readFile((await download.path())!);expect(backup.toString()).not.toMatch(/my-practice|iVBORw0KGgo/);
  const other=await browser.newContext();try{
    const restored=await other.newPage();await restored.goto(new URL('/',page.url()).href);await restored.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});await unlock(restored);await nav(restored,de.finances);await restored.locator('.invoice-list .table-client').first().click();dialog=restored.getByRole('dialog');await expect.poll(()=>dialog.locator('.invoice-logo-custom img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1254);expect((await pdfImages(restored)).count).toBeGreaterThan(0);await scan(restored);
  }finally{await other.close();}
});

test('PNG errors translate without replacing the chosen logo and the controls fit a dark phone',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem('praxisraum-theme','dark'));const {data}=workflowData();const read=await seedWorkflow(page,data);await nav(page,de.settings);const practice=page.locator('#settings-practice');
  await practice.getByLabel(de.invoiceLogoUpload,{exact:true}).setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(practice.getByRole('alert')).toContainText(de.invoiceLogoInvalid);expect((await read()).settings.invoiceLogo).toEqual({enabled:true,source:'nadiia'});await scan(page);
  await page.getByRole('button',{name:'Українська',exact:true}).first().click();await expect(practice.getByRole('alert')).toContainText(uk.invoiceLogoInvalid);await expect(practice.getByLabel(uk.invoiceLogoEnabled,{exact:true})).toBeChecked();await scan(page);
});
