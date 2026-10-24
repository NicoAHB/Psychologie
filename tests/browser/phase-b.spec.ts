import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, workflowData, unlock } from './workflow-fixture';
import { addDays, today } from '../../src/lib/dates';
import { materialize,mergeStates,recordChanges,stateOf } from '../../src/lib/crdt';
import { completeAndPay,completedSessionId } from '../../src/lib/practiceFlow';
import { uid, type Client } from '../../src/lib/types';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url),'utf8')) as Record<string,string>;
for (const theme of ['light','dark']) test(`failure fee and consented email preview stay local in ${theme} mode`,async({page})=>{
  test.setTimeout(90000);await page.addInitScript(theme=>{localStorage.setItem('praxisraum-theme',theme);},theme);
  const {data,client}=workflowData();data.settings.defaultCancellationFeeCents=3000;
  (client as Client).appointmentEmailConsent={id:uid(),destination:client.email,grantedAt:new Date().toISOString()};
  if(theme==='dark')(client as Client).currency='EUR';
  (client as Client).cancellationFee={currency:'UAH',amountCents:120000};
  const appt={id:uid(),clientId:client.id,date:addDays(today(),2),time:'14:00',duration:50,timeZone:'Europe/Berlin',reminderId:uid(),status:'scheduled' as const,feeCents:8500,billing:theme==='dark'?undefined:{currency:'UAH' as const,amountCents:409100,rate:data.settings.exchangeRate}};data.appointments.push(appt);
  let sendRequests=0;await page.route('**/functions/v1/send-client-email',route=>{sendRequests++;return route.abort();});const read=await seedWorkflow(page,data);
  await nav(page,de.appointments);await page.getByRole('button',{name:de.appointmentEmailTitle,exact:true}).click();const email=page.getByRole('dialog',{name:de.appointmentEmailTitle,exact:true});await expect(email).toContainText('Підтвердження');await expect(email).not.toContainText('Sitzungsnotiz');await expect(email.getByRole('button',{name:de.appointmentEmailSend,exact:true})).toBeDisabled();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);await email.getByRole('button',{name:de.close,exact:true}).last().click();
  await page.getByRole('button',{name:de.appointmentFailure,exact:true}).click();const failure=page.getByRole('dialog',{name:de.appointmentFailure,exact:true});await expect(failure.getByLabel(de.feeUah,{exact:true})).toHaveValue('1200');
  await failure.getByLabel(de.appointmentOutcome,{exact:true}).selectOption('lateCancelled');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await failure.getByRole('button',{name:de.save,exact:true}).click();await expect(failure).toHaveCount(0,{timeout:15000});const stored=await read();const charge=stored.sessions.find(s=>s.appointmentId===appt.id)!;expect(charge.kind).toBe('cancellationFee');expect(charge.paidAt).toBeNull();expect(charge.billing?.amountCents).toBe(theme==='dark'?2500:120000);expect(charge.billing?.currency).toBe(theme==='dark'?'EUR':'UAH');
  await nav(page,de.finances);await expect(page.locator('.finance-open li').filter({hasText:de.cancellationFee})).toHaveCount(1);expect(sendRequests).toBe(0);
  await page.getByRole('button',{name:de.lock,exact:true}).last().click();await page.reload();await unlock(page);expect((await read()).sessions.find(s=>s.id===charge.id)?.kind).toBe('cancellationFee');
});

test('waiting list persists and a cancelled future appointment produces a direct Today hint',async({page})=>{
  const {data,client}=workflowData();const appointment={id:uid(),clientId:client.id,date:addDays(today(),3),time:'15:00',duration:50,timeZone:'Europe/Berlin',feeCents:8500,reminderId:uid(),status:'scheduled' as const};data.appointments.push(appointment);const read=await seedWorkflow(page,data);
  await nav(page,de.appointments);await page.getByRole('button',{name:de.waitlistAdd,exact:true}).click();const dialog=page.getByRole('dialog',{name:de.waitlistAdd,exact:true});await dialog.getByLabel(de.waitlistClient,{exact:true}).selectOption(client.id);await dialog.getByLabel(de.waitlistTimes,{exact:true}).fill('Nachmittags');await dialog.getByLabel(de.waitlistNote,{exact:true}).fill('Bitte persönlich abstimmen');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);await dialog.getByRole('button',{name:de.save,exact:true}).click();await expect(dialog).toHaveCount(0,{timeout:15000});
  page.once('dialog',d=>void d.accept());await page.getByRole('button',{name:de.cancelAppointment,exact:true}).click();await nav(page,de.overview);await expect(page.locator('.waiting-notice')).toContainText(de.waitlistFreeTitle);await page.getByRole('button',{name:de.waitlistOpen,exact:true}).click();await expect(page.locator('#waitlist-panel')).toBeFocused();await expect(page.locator('.waiting-list')).toContainText('Nachmittags');
  await page.getByRole('button',{name:de.lock,exact:true}).last().click();await page.reload();await unlock(page);expect((await read()).waitlist[0].preferredTimes).toBe('Nachmittags');
  await nav(page,de.appointments);page.once('dialog',d=>void d.accept());await page.locator('.waiting-list').getByRole('button',{name:new RegExp('^'+de.delete+':')}).click();await expect(page.locator('.waiting-list')).toHaveCount(0);expect((await read()).waitlist).toHaveLength(0);
});

test('reviewing offline completion versus no-show keeps the selected fee and outcome together',async({page})=>{
 const {data,client}=workflowData();const appointment={id:uid(),clientId:client.id,date:today(),time:'12:00',duration:50,timeZone:'Europe/Berlin',feeCents:8500,reminderId:uid(),status:'scheduled' as const};data.appointments.push(appointment);data.crdt=stateOf(data);
 const a=structuredClone(data),b=structuredClone(data);a.appointments[0].status='noShow';a.sessions.push({id:completedSessionId(appointment.id),appointmentId:appointment.id,clientId:client.id,date:appointment.date,time:appointment.time,feeCents:3000,billing:{currency:'EUR',amountCents:3000},paidAt:null,notes:'',tags:[],kind:'cancellationFee',failureStatus:'noShow'});completeAndPay(b,appointment.id,'cash');recordChanges(data,a,10,'a');recordChanges(data,b,20,'b');
 const merged=materialize(a,mergeStates(stateOf(a),stateOf(b))),read=await seedWorkflow(page,merged);await page.getByRole('button',{name:de.syncConflictsReview,exact:true}).click();const dialog=page.getByRole('dialog');const fee=dialog.locator('.conflict-variant').filter({hasText:de.cancellationFee});await expect(fee).toHaveCount(1);
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);await fee.getByRole('button',{name:new RegExp('^'+de.syncConflictChoose)}).click();await expect(dialog).toHaveCount(0,{timeout:15000});const restored=await read();expect(restored.sessions.find(s=>s.appointmentId===appointment.id)?.kind).toBe('cancellationFee');expect(restored.appointments[0].status).toBe('noShow');
});
