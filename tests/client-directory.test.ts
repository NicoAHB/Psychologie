import test from 'node:test';
import assert from 'node:assert/strict';
import {indexClientDirectory,findDirectoryClients} from '../src/lib/clientDirectory';
import type {Client} from '../src/lib/types';
const client=(id:string,name:string,status?:Client['status'],email?:string):Client=>({id,name,...status&&{status},email,language:'de',createdAt:'2026-01-01',contact:'',preparation:'',telegramChatId:'',reminderConsent:false});
const people=[client('active','Nádïia Matusevych',undefined,'NADI@example.com'),client('paused','Олена Коваль','paused','olena@example.com'),client('closed','Nadiia Beispiel','closed')];
test('directory search matches trimmed words in any order, accents, Cyrillic and email without changing records',()=>{
 const before=structuredClone(people),index=indexClientDirectory(people);
 assert.deepEqual(findDirectoryClients(index,'  MATUSEVYCH  nadiia ','all').visible.map(c=>c.id),['active']);
 assert.deepEqual(findDirectoryClients(index,'КОВАЛЬ олена','all').visible.map(c=>c.id),['paused']);
 assert.deepEqual(findDirectoryClients(index,'NADI@EXAMPLE.COM','all').visible.map(c=>c.id),['active']);
 assert.deepEqual(people,before);
});
test('chosen status stays explicit while hidden matching former clients remain discoverable',()=>{
 const index=indexClientDirectory(people),search=findDirectoryClients(index,'nadiia','active');
 assert.deepEqual(search.visible.map(c=>c.id),['active']);assert.equal(search.otherCount,1);
 const hidden=findDirectoryClients(index,'olena@example.com','active');assert.deepEqual(hidden.visible,[]);assert.equal(hidden.otherCount,1);
 assert.deepEqual(findDirectoryClients(index,'olena@example.com','all').visible.map(c=>c.id),['paused']);
 assert.equal(findDirectoryClients(index,'   ','active').otherCount,0);
 assert.deepEqual(findDirectoryClients(index,'does not exist','all'),{visible:[],otherCount:0});
});
