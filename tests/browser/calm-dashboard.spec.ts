import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
import { addDays, today } from '../../src/lib/dates';
import { uid } from '../../src/lib/types';
const de=JSON.parse(await readFile(new URL('../../src/locales/de.json',import.meta.url),'utf8')) as Record<string,string>;
const uk=JSON.parse(await readFile(new URL('../../src/locales/uk.json',import.meta.url),'utf8')) as Record<string,string>;

test('Today shows one next appointment, three priorities and separate native money; secondary tools open by keyboard',async({page})=>{
  const {data,client}=workflowData();
  for(let i=0;i<5;i++)data.followUps.push({id:uid(),clientId:client.id,dueOn:addDays(today(),-i),note:`Aufgabe ${i}`,createdAt:new Date().toISOString()});
  data.appointments.push({id:uid(),clientId:client.id,date:addDays(today(),1),time:'14:00',duration:50,feeCents:8500,timeZone:'Europe/Berlin',status:'scheduled',reminderId:uid()});
  await seedWorkflow(page,data);
  await expect(page.locator('.today-next .appointment-row')).toHaveCount(1);
  await expect(page.locator('.today-priorities .work-list > li')).toHaveCount(3);
  for(const selector of ['.today-tasks','.today-appointments','.today-clients','.today-payments details']) await expect(page.locator(selector)).not.toHaveAttribute('open');
  await expect(page.locator('.today-payments .currency-totals').first()).toContainText('EUR');
  await expect(page.locator('.today-payments .currency-totals').first()).toContainText('UAH');
  const summary=page.locator('.today-tasks > summary');await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('.work-care')).toBeVisible();
  await page.locator('.today-payments details > summary').click();await expect(page.locator('.today-payments .follow-up-invoices')).toBeVisible();
});

test('payment filters follow receipt month, preserve separate currencies and identify overdue invoices',async({page})=>{
  const point=new Date(Date.UTC(new Date().getFullYear()+1,0,5,12));await page.clock.install({time:point});
  const {data,client}=workflowData();const previous=new Date(point);previous.setDate(1);previous.setMonth(previous.getMonth()-1);const day=`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2,'0')}-05`;
  data.sessions.push({id:uid(),clientId:client.id,date:'2024-01-01',time:'10:00',paidAt:day,feeCents:8500,notes:'Earlier appointment',tags:[],billing:{currency:'UAH',amountCents:409100}});
  await seedWorkflow(page,data);await nav(page,de.finances);
  const filters=page.getByRole('navigation',{name:de.paymentQuickFilters});await filters.getByRole('button',{name:de.lastMonthFilter,exact:true}).click();
  await expect(page.locator('.finance-records tbody tr')).toHaveCount(1);
  const native=page.getByRole('region',{name:`${de.receivedNative}: UAH`});await expect(native).toContainText('4.091');
  await page.getByRole('combobox',{name:de.chartCurrency,exact:true}).selectOption('UAH');await expect(page.locator('.income-chart h2')).toContainText('UAH');
  await expect(page.locator('.income-chart .chart-value strong')).toContainText('4.091');await expect(page.locator('.income-chart .chart-value')).toContainText(String(previous.getFullYear()));
  await filters.getByRole('button',{name:de.overdue,exact:true}).click();await expect(page.locator('.open-payment-list > li')).toHaveCount(2);
  await page.getByRole('button',{name:'Українська',exact:true}).first().click();await expect(page.getByRole('navigation',{name:uk.paymentQuickFilters})).toBeVisible();
});

for(const [width,theme] of [[820,'light'],[390,'dark']] as const)test(`grouped settings, private conversation notes and storage details are accessible at ${width}px`,async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width,height:1180});
  await page.addInitScript(theme=>localStorage.setItem('praxisraum-theme',theme),theme);
  const {data}=workflowData();const read=await seedWorkflow(page,data);await nav(page,de.settings,true);
  await expect(page.locator('#settings-practice')).toBeVisible();await expect(page.locator('#settings-backup')).toBeHidden();
  const search=page.getByLabel(de.settingsSearch,{exact:true});await search.fill('IBAN');await expect(page.locator('[data-settings-card]:not([hidden])')).toHaveCount(1);
  await search.fill('Schriftgröße');await expect(page.locator('#settings-appearance')).toBeVisible();
  await page.getByLabel(de.fontSize,{exact:true}).selectOption('extraLarge');
  await search.fill('Sicherung');await expect(page.locator('#settings-backup')).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  for(let attempt=0;attempt<2;attempt++){
    await page.getByRole('button',{name:de.appearance,exact:true}).click();
    await page.getByRole('button',{name:de.storageStatus,exact:true}).click();
    await page.getByRole('dialog',{name:de.storageStatus,exact:true}).getByRole('button',{name:de.cloudTitle,exact:true}).click();
    await expect(page.locator('#settings-cloud')).toBeFocused();
  }
  await nav(page,de.clients);await page.locator('.directory-list button').first().click();
  await expect(page.locator('.profile-panel > section').first()).toHaveClass(/preparation-card/);
  await expect(page.locator('.profile-more')).not.toHaveAttribute('open');
  await page.getByRole('button',{name:de.conversationMode,exact:true}).click();
  await expect(page.getByRole('button',{name:de.conversationExit,exact:true})).toBeFocused();await expect(page.locator('.sidebar')).toBeHidden();await expect(page.locator('.client-directory')).toBeHidden();
  await expect(page.locator('.conversation-content')).not.toContainText(/€|₴|грн/);
  const preparation=page.getByRole('textbox',{name:de.preparation,exact:true});await preparation.fill('Vertrauliche Vorbereitung im Gespräch');
  await expect(page.locator('.sync-bar')).toContainText(de.savePending);
  await expect(page.locator('.sync-bar')).toContainText(de.savedAtTime.split('{time}')[0],{timeout:15000});
  await page.screenshot({path:`/tmp/praxisraum-conversation-${width}-${test.info().project.name}.png`,fullPage:true});
  const notes=page.getByRole('textbox',{name:de.sessionNotes,exact:true});await notes.fill('Neue private Terminnotiz');
  // Lock immediately: the debounce must flush and the private view must clear.
  await page.getByRole('button',{name:de.lock,exact:true}).last().click();await expect(page.locator('.app-shell')).toHaveCount(0);
  await page.reload();await unlock(page);await expect.poll(async()=> (await read()).sessions.find(s=>s.notes==='Neue private Terminnotiz')?.notes).toBe('Neue private Terminnotiz');
  await nav(page,de.clients);await page.locator('.directory-list button').first().click();await expect(preparation).toHaveValue('Vertrauliche Vorbereitung im Gespräch');
  await page.getByRole('button',{name:de.conversationMode,exact:true}).click();
  for(const words of [de,uk]){
    if(words===uk)await page.getByRole('button',{name:'Українська',exact:true}).first().click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.getByRole('button',{name:words.storageStatus,exact:true}).click();const dialog=page.getByRole('dialog',{name:words.storageStatus,exact:true});
    await expect(dialog).toContainText(words.storageCloud);await expect(dialog).toContainText(words.storageExternal);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button',{name:uk.conversationExit,exact:true}).click();await expect(page.getByRole('button',{name:uk.conversationMode,exact:true})).toBeFocused();await expect(page.locator('.profile-tabs')).toBeVisible();
  await page.getByRole('button',{name:uk.conversationMode,exact:true}).click();await page.locator('.sync-bar').getByRole('button',{name:uk.sync,exact:true}).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/conversation-mode/);await expect(page.locator('#settings-cloud')).toBeFocused();
});
