import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, type Session } from '../src/lib/types';
import { currencyTotals, nativeMonthlyIncome, paymentMonth, receiptTotals } from '../src/lib/paymentOverview';
import { financeRows } from '../src/lib/finance';
import { dailyTasks, nextPracticeAppointment } from '../src/lib/dailyOverview';
import { findSettings, settingsCards, settingsGroupFor } from '../src/lib/settingsIndex';
import { EditTracker, hasUnsavedEdits, registerEditStatus } from '../src/lib/editStatus';
import { readExternalBackupState, markBackup, markCloudSync, readCloudSyncState } from '../src/lib/backupState';
import 'fake-indexeddb/auto';

const session = (id:string, paidAt:string|null, amount=8500):Session => ({id,clientId:'c',date:'2025-01-01',time:'12:00',notes:'',tags:[],paidAt,feeCents:amount});
test('native payments never add EUR and UAH together; comparison remains explicit',()=>{
  const rows=[session('e','2026-01-02'),{...session('u','2026-01-03'),billing:{currency:'UAH' as const,amountCents:409100}},session('open',null),session('old','2025-12-31')];
  assert.deepEqual(receiptTotals(rows,'2026-01'),{EUR:8500,UAH:409100});
  assert.deepEqual(currencyTotals(rows.filter(s=>!s.paidAt)),{EUR:8500,UAH:0});
  assert.equal(nativeMonthlyIncome(rows,2026,'UAH')[0],409100);
  assert.equal(nativeMonthlyIncome(rows,2026,'EUR')[0],8500);
  assert.equal(nativeMonthlyIncome(rows,2026,'comparison')[0],17000);
});
test('last month crosses New Year and follows actual receipt dates',()=>{
  assert.equal(paymentMonth(new Date(2026,0,5),-1),'2025-12');
  const rows=[session('old','2025-12-31'),session('new','2026-01-01')];
  assert.deepEqual(financeRows(rows,2026,'lastMonthIncome','paid',new Date(2026,0,5)).map(s=>s.id),['old']);
});
test('today prioritises overdue care; financial tasks stay out of the three care priorities',()=>{
  const data=emptyVault(); data.clients.push({id:'c',name:'Test',language:'de',createdAt:'2026-01-01',preparation:'',contact:'',telegramChatId:'',reminderConsent:false,followUpOn:'2026-01-01'});
  data.sessions.push(session('unbilled',null));
  const tasks=dailyTasks(data,new Date('2026-02-01T12:00:00Z'));
  assert.equal(tasks[0].type==='work'&&tasks[0].item.kind,'followUp');
  assert.ok(tasks.every(t=>t.type!=='work'||t.item.kind!=='invoice'));
  const a={id:'a',clientId:'c',date:'2026-02-01',time:'13:00',duration:50,feeCents:8500,timeZone:'UTC',reminderId:'r',status:'scheduled' as const};
  data.appointments.push(a,{...a,id:'past',time:'09:00'},{...a,id:'cancel',time:'12:30',status:'cancelled'});
  assert.equal(nextPracticeAppointment(data,new Date('2026-02-01T12:00:00Z'))?.id,'a');
});
test('settings search spans all groups in German and Ukrainian and preserves every card',()=>{
  assert.deepEqual(findSettings('IBAN','de','appearance').map(c=>c.id),['practice']);
  assert.ok(findSettings('резервна копія','uk','practice').some(c=>c.id==='backup'));
  assert.equal(findSettings('','de','all').length,settingsCards.length);
  assert.equal(settingsGroupFor('banks'),'practice');assert.equal(settingsGroupFor('cloud'),'data');
});
test('debounce, write, edit-during-write and errors cannot claim a stale save',()=>{
  const tracker=new EditTracker();tracker.changed();assert.equal(tracker.getSnapshot().phase,'pending');
  const first=tracker.begin();tracker.changed();tracker.finish(first,10);assert.deepEqual(tracker.getSnapshot(),{phase:'pending'});
  const second=tracker.begin();tracker.finish(second,20);assert.deepEqual(tracker.getSnapshot(),{phase:'clean',savedAt:20});
  tracker.changed();tracker.begin();tracker.fail();assert.equal(tracker.getSnapshot().phase,'error');
  const cancelled=tracker.begin();tracker.clear();tracker.finish(cancelled,30);assert.deepEqual(tracker.getSnapshot(),{phase:'clean'});
  const a=registerEditStatus(),b=registerEditStatus();a.set('pending');b.set('saving');assert.equal(hasUnsavedEdits(),true);a.close();assert.equal(hasUnsavedEdits(),true);b.close();assert.equal(hasUnsavedEdits(),false);
});
test('cloud acknowledgement cannot replace the external backup time and is scoped to account',async()=>{
  await markBackup('ux','download',10,'old');
  await markCloudSync('ux','account-a','new',20);await markBackup('ux','cloud',20,'new');
  assert.equal((await readExternalBackupState('ux'))?.at,10);
  assert.equal((await readCloudSyncState('ux','account-a'))?.at,20);
  assert.equal(await readCloudSyncState('ux','account-b'),undefined);
});
