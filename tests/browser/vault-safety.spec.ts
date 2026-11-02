import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json',import.meta.url),'utf8')) as Record<string,string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json',import.meta.url),'utf8')) as Record<string,string>;

async function add(page: Page,name: string,success = true){
  await nav(page,de.clients);await page.getByRole('button',{name:de.newClient,exact:true}).first().click();
  const form=page.getByRole('dialog',{name:de.newClient,exact:true});await form.getByLabel(`${de.name} *`,{exact:true}).fill(name);await form.getByRole('button',{name:de.save,exact:true}).click();
  if(success)await expect(form).toHaveCount(0,{timeout:15000});else await expect(form.getByRole('alert')).toContainText(de.storageError);
}
test('a second window waits for the first to lock and then opens the latest encrypted data',async({page,context})=>{
  test.setTimeout(90000);const {data}=workflowData();const read=await seedWorkflow(page,data);const second=await context.newPage();await second.goto('/');
  await second.getByLabel(de.passphrase,{exact:true}).fill('a very strong test passphrase');await second.getByRole('button',{name:de.unlock,exact:true}).click();
  await expect(second.getByRole('alert')).toHaveText(de.vaultInUse);
  await add(page,'Synthetic first window');await page.locator('.topbar').getByRole('button',{name:de.lock,exact:true}).click();await expect(page.locator('.welcome-page')).toBeVisible();
  await second.getByRole('button',{name:de.unlock,exact:true}).click();await expect(second.locator('.app-shell')).toBeVisible({timeout:15000});
  await add(second,'Synthetic second window');expect((await read()).clients.map(c=>c.name)).toEqual(expect.arrayContaining(['Synthetic first window','Synthetic second window']));
  await second.close();await unlock(page);await nav(page,de.clients);await expect(page.getByText('Synthetic second window',{exact:true})).toBeVisible();
});
test('without Web Locks a stale write is refused and local CRDT merging preserves both windows',async({page,context})=>{
  test.setTimeout(90000);await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{configurable:true,value:undefined}));
  const {data}=workflowData();const read=await seedWorkflow(page,data);const second=await context.newPage();await second.goto('/');await unlock(second);
  await add(page,'Synthetic offline alpha');await add(second,'Synthetic offline beta',false);
  expect((await read()).clients.map(c=>c.name)).not.toContain('Synthetic offline beta');
  const form=second.getByRole('dialog',{name:de.newClient,exact:true});await form.getByRole('button',{name:de.close,exact:true}).first().click();
  await second.getByRole('button',{name:de.vaultMergeLocal,exact:true}).click();await expect(second.getByRole('button',{name:de.vaultMergeLocal,exact:true})).toHaveCount(0,{timeout:15000});
  expect((await read()).clients.map(c=>c.name)).toEqual(expect.arrayContaining(['Synthetic offline alpha','Synthetic offline beta']));
  await second.reload();await unlock(second);await nav(second,de.clients);await expect(second.getByText('Synthetic offline alpha',{exact:true})).toBeVisible();await expect(second.getByText('Synthetic offline beta',{exact:true})).toBeVisible();
});
test('downloading an old history checkpoint does not acknowledge a current external backup',async({page})=>{
  const {data}=workflowData();await seedWorkflow(page,data);await nav(page,de.settings);
  const historical=page.getByRole('button',{name:new RegExp(`^${de.historyDownload}`)}).first();await expect(historical).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),historical.click()]);const json=JSON.parse(await readFile((await download.path())!,'utf8'));expect(json.type).toBe('praxisraum-backup-v1');
  await nav(page,de.overview);await expect(page.getByText(de.backupBannerNever,{exact:false})).toBeVisible();
});
test('newsletter text and image restore after locking; explicit discard stays discarded after reload',async({page},info)=>{
  test.setTimeout(90000);page.on('dialog',d=>void d.accept());const {data}=workflowData();const read=await seedWorkflow(page,data);await nav(page,de.newsletter);
  await page.getByLabel(de.marketingMessageDe,{exact:true}).fill('Privater Testentwurf nach Neustart');
  const png = await page.evaluate(() => { const canvas=document.createElement('canvas'); canvas.width=10; canvas.height=10; const ctx=canvas.getContext('2d')!; ctx.fillStyle='#6894a0';ctx.fillRect(0,0,10,10);return canvas.toDataURL('image/png').split(',')[1]; });
  await page.locator('input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByText(de.newsletterDraftSaved,{exact:true})).toBeVisible({timeout:15000});await expect.poll(async()=>!!(await read()).newsletterDrafts[0]?.payload.image).toBe(true);
  await page.locator('.topbar').getByRole('button',{name:de.lock,exact:true}).click();await unlock(page);await nav(page,de.newsletter);
  await expect(page.getByLabel(de.marketingMessageDe,{exact:true})).toHaveValue('');await page.getByRole('button',{name:de.newsletterDraftResume,exact:true}).click();
  await expect(page.getByLabel(de.marketingMessageDe,{exact:true})).toHaveValue('Privater Testentwurf nach Neustart');await expect(page.locator('img.marketing-image')).toBeVisible();
  await nav(page,de.settings);await page.getByLabel(de.colorScheme,{exact:true}).selectOption('dark');await page.getByLabel(de.fontSize,{exact:true}).selectOption('extraLarge');await nav(page,de.newsletter);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Українська',exact:true}).first().click();await expect(page.getByRole('button',{name:uk.newsletterDraftDiscard,exact:true})).toBeVisible();await page.getByRole('button',{name:uk.newsletterDraftDiscard,exact:true}).click();
  await expect.poll(async()=>(await read()).newsletterDrafts.length).toBe(0);await page.reload();
  await page.getByRole('button',{name:'Deutsch',exact:true}).first().click();await unlock(page);await nav(page,de.newsletter);await expect(page.getByRole('button',{name:de.newsletterDraftResume,exact:true})).toHaveCount(0);
  expect(info.project.name).toBeTruthy();
});
test('storage warning and estimates work in both languages and fit a dark portrait tablet',async({page},info)=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'storage',{configurable:true,value:{estimate:async()=>({usage:96*1048576,quota:100*1048576}),persisted:async()=>false,persist:async()=>false}}));
  await page.setViewportSize({width:/mobile|iphone/.test(info.project.name)?390:820,height:1180});const {data}=workflowData();await seedWorkflow(page,data);await expect(page.getByText(de.storageCritical,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:de.storageOpenBackup,exact:true}).click();await expect(page.locator('#settings-backup')).toBeFocused();
  const card=page.getByRole('region',{name:de.storageHealthTitle,exact:true});await expect(card.getByRole('meter')).toBeVisible();await expect(card).toContainText(de.storageNotPersistent);
  await page.getByLabel(de.colorScheme,{exact:true}).selectOption('dark');await page.getByLabel(de.fontSize,{exact:true}).selectOption('extraLarge');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Українська',exact:true}).first().click();await expect(page.getByRole('region',{name:uk.storageHealthTitle,exact:true})).toBeVisible();await expect(page.getByText(uk.storageCritical,{exact:true})).toBeVisible();
});
test('missing storage APIs remain understandable and never block encrypted work',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'storage',{configurable:true,value:undefined}));
  const {data}=workflowData();await seedWorkflow(page,data);await nav(page,de.settings);
  const card=page.getByRole('region',{name:de.storageHealthTitle,exact:true});
  await expect(card).toContainText(de.storageEstimateUnavailable);await expect(card).toContainText(de.storagePersistenceUnknown);await expect(card.getByRole('meter')).toHaveCount(0);
  expect(errors).toEqual([]);
});
