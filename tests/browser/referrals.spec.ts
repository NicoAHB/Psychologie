import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, workflowData, unlock } from './workflow-fixture';
import { uid, type Client, type VaultData } from '../../src/lib/types';
import { addDays } from '../../src/lib/dates';
const de=JSON.parse(await readFile(new URL('../../src/locales/de.json',import.meta.url),'utf8')) as Record<string,string>;
const uk=JSON.parse(await readFile(new URL('../../src/locales/uk.json',import.meta.url),'utf8')) as Record<string,string>;
const code='PRX-ABCDEF123456';
function lastCompletedQuarter(){const now=new Date();return new Date(Date.UTC(now.getFullYear(),Math.floor(now.getMonth()/3)*3,0)).toISOString().slice(0,10);}
function fixtureReferral(data:VaultData,referrerId:string,referredId:string,firstPaidOn:string){data.referrals.push({id:uid(),referrerId,referredId,code,registeredOn:firstPaidOn,firstPaidOn,consentAt:`${firstPaidOn}T12:00:00Z`,consentLanguage:'uk',consentVersion:'2026-10-23',rateBps:1000,months:12});}

function setup(){const {data,client}=workflowData();(client as Client).language='de';data.referralCodes.push({id:uid(),clientId:client.id,code,createdAt:new Date().toISOString()});return{data,client};}

test('voluntary code registration, local PNG card and encrypted persistence after lock/reload',async({page})=>{
  test.setTimeout(90000);const{data,client}=setup(),read=await seedWorkflow(page,data);
  await nav(page,'Klienten');await page.getByRole('button',{name:'Klient anlegen',exact:true}).first().click();
  const form=page.getByRole('dialog');await form.getByLabel('Name *',{exact:true}).fill('Neue Person mit Empfehlung');
  await form.getByLabel(de.referralOptionalCode,{exact:true}).fill('PRX-000000000000');await form.getByRole('button',{name:de.referralCheck,exact:true}).click();await expect(form.getByRole('alert')).toContainText(de.referralInvalidCode);
  await form.getByLabel(de.referralOptionalCode,{exact:true}).fill(code);await form.getByRole('button',{name:de.referralCheck,exact:true}).click();await expect(form.getByRole('status').filter({hasText:de.referralCodeValid})).toBeVisible();
  const formAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(formAxe.violations).toEqual([]);
  // Saving without consent must not persist a partially-created client.
  await form.getByRole('button',{name:'Speichern',exact:true}).click();await expect(form.getByRole('alert')).toContainText(de.referralConsentRequired);
  await form.getByRole('checkbox',{name:de.referralConsentRecorded,exact:true}).check();await form.getByRole('button',{name:'Speichern',exact:true}).click();await expect(form).toHaveCount(0,{timeout:15000});
  await nav(page,de.referrals);await page.getByRole('button',{name:de.referralLedgerTab,exact:true}).click();await expect(page.locator('.referral-record')).toContainText(client.id);await expect(page.locator('.referral-record')).not.toContainText(client.name);await expect(page.locator('.referral-record')).not.toContainText('Neue Person mit Empfehlung');
  await page.getByRole('button',{name:de.referralCodesTab,exact:true}).click();await page.locator('.referral-code-list').getByRole('button',{name:de.referralCard,exact:true}).click();
  const card=page.getByRole('dialog',{name:de.referralCard,exact:true});await expect(card.locator('img')).toBeVisible();await expect(card).toContainText(de.referralCardText.replace('[CODE]',code));
  await card.getByLabel(de.referralCardLanguage,{exact:true}).selectOption('uk');await expect(card).toContainText(uk.referralCardText.replace('[CODE]',code));
  await expect(card.locator('img')).toBeVisible();const downloadPromise=page.waitForEvent('download');await card.getByRole('link',{name:de.referralDownload,exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe(`Praxisraum-${code}-uk.png`);
  // The downloaded artifact is an actual PNG produced from local system-font Canvas.
  const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));expect(Buffer.concat(chunks).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  await card.getByRole('button',{name:'Schließen',exact:true}).click();await page.locator('.topbar').getByRole('button',{name:'Sperren',exact:true}).click();await expect(page.locator('.app-shell')).toHaveCount(0,{timeout:15000});await page.reload();await unlock(page);await nav(page,de.referrals);await page.getByRole('button',{name:de.referralLedgerTab,exact:true}).click();await expect(page.locator('.referral-record')).toHaveCount(1);
  const saved=await read();expect(saved.referrals).toHaveLength(1);expect(saved.referrals[0].consentAt).toBeTruthy();expect(saved.referralCodes[0].code).toBe(code);
});

test('quarterly payout uses native EUR and UAH, is booked once and remains auditable after reversal',async({page})=>{
  test.setTimeout(90000);const{data,client}=setup();data.sessions=[];data.invoices=[];const other={...client,id:uid(),name:'Private Person',currency:'UAH' as const};data.clients.push(other);const first=addDays(lastCompletedQuarter(),-10);fixtureReferral(data,client.id,other.id,first);for(const currency of ['EUR','UAH']as const)data.sessions.push({id:uid(),clientId:other.id,date:first,time:'12:00',paidAt:first,feeCents:8500,billing:{currency,amountCents:currency==='EUR'?8500:400000},notes:'Never show in referrals',tags:[]});
  delete data.referrals[0].firstPaidOn;
  const read=await seedWorkflow(page,data);await nav(page,de.referrals);await page.getByRole('button',{name:de.referralLedgerTab,exact:true}).click();await expect(page.locator('.referral-record')).toHaveCount(2);await expect(page.locator('.referral-records')).not.toContainText('Private Person');
  await page.getByRole('button',{name:de.referralPayout,exact:true}).first().click();const modal=page.getByRole('dialog',{name:de.referralPayout,exact:true});await expect(modal).toContainText('8,50');await modal.getByRole('checkbox',{name:de.referralPayoutConfirm,exact:true}).check();await modal.getByRole('button',{name:de.referralPayout,exact:true}).click();await expect(modal).toHaveCount(0,{timeout:15000});
  await expect(page.getByRole('button',{name:de.referralPayout,exact:true}).first()).toBeDisabled();await expect(page.getByRole('button',{name:de.referralPayout,exact:true}).last()).toBeEnabled();
  page.once('dialog',d=>void d.accept());await page.getByRole('button',{name:de.referralReverse,exact:true}).click();await expect(page.getByRole('button',{name:de.referralReverse,exact:true})).toHaveCount(0,{timeout:15000});await expect(page.getByText(de.referralReversal,{exact:false})).toBeVisible();
  await page.getByRole('button',{name:de.referralSettingsTab,exact:true}).click();await page.getByLabel(de.referralRate,{exact:true}).fill('15');await page.getByLabel(de.referralMonths,{exact:true}).fill('6');await page.getByRole('button',{name:de.save,exact:true}).click();await expect(page.getByRole('button',{name:/^Gespeichert um \d{2}:\d{2}$/})).toBeDisabled({timeout:15000});
  await page.getByLabel(de.referralMonths,{exact:true}).fill('12');await expect(page.getByRole('button',{name:de.save,exact:true})).toBeEnabled();
  const saved=await read();expect(saved.referralPayouts.map(p=>p.amountCents).sort((a,b)=>a-b)).toEqual([-850,850]);expect(saved.referrals[0].rateBps).toBe(1000);expect(saved.settings.referralProgram).toEqual({rateBps:1500,months:6});
});

for(const theme of ['light','dark']as const){test(`referral views and card/payout dialogs are accessible and fit tablet/phone in ${theme}`,async({page},testInfo)=>{
  test.setTimeout(90000);if(testInfo.project.name==='desktop')await page.setViewportSize({width:820,height:1180});await page.addInitScript(theme=>{localStorage.setItem('praxisraum-theme',theme);localStorage.setItem('praxisraum-language','de');},theme);
  const{data,client}=setup();data.sessions=[];data.invoices=[];const other={...client,id:uid(),name:'Hidden Person'};data.clients.push(other);const day=addDays(lastCompletedQuarter(),-5);fixtureReferral(data,client.id,other.id,day);data.sessions.push({id:uid(),clientId:other.id,date:day,time:'10:00',paidAt:day,feeCents:8500,notes:'',tags:[]});await seedWorkflow(page,data);await nav(page,de.referrals);
  const scan=async()=>{const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);};
  await scan();await page.locator('.referral-code-list').getByRole('button',{name:de.referralCard,exact:true}).click();await expect(page.getByRole('dialog').locator('img')).toBeVisible();await scan();await page.getByRole('dialog').getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByLabel(de.referralSelectClient,{exact:true}).selectOption(other.id);await page.locator('.referral-form-grid').getByRole('button',{name:de.referralCard,exact:true}).click();await scan();await expect(page.getByRole('dialog').getByRole('button',{name:de.referralCreateCode,exact:true})).toBeDisabled();await page.getByRole('dialog').getByRole('button',{name:'Schließen',exact:true}).click();
  for(const label of [de.referralLedgerTab,de.referralSettingsTab]){await page.getByRole('button',{name:label,exact:true}).click();await scan();}
  await page.getByRole('button',{name:de.referralLedgerTab,exact:true}).click();await page.getByRole('button',{name:de.referralPayout,exact:true}).click();await scan();await page.keyboard.press('Escape');
  await page.locator('.topbar').getByRole('button',{name:'Українська',exact:true}).click();await expect(page.getByRole('heading',{name:uk.referrals,exact:true})).toBeVisible();await scan();
});}
