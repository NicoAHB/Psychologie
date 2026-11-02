import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json',import.meta.url),'utf8')) as Record<string,string>;
test('a rendering error keeps the key and unsaved state alive and retries persistence before restoring the view',async({browser},info)=>{
  test.skip(info.project.name==='mobile','The same persistence/boundary code is exercised independently of viewport.');test.setTimeout(90000);
  const directory=await mkdtemp(`${process.cwd()}/tests/runtime-recovery-`);
  await writeFile(`${directory}/index.html`,'<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Recovery test</title></head><body><div id="root"></div><script type="module" src="./harness.tsx"></script></body></html>');
  await writeFile(`${directory}/harness.tsx`, `import {createRoot} from 'react-dom/client';
import {useState} from 'react';import {I18nProvider} from '../../src/lib/i18n';import {useVault} from '../../src/lib/useVault';import {VaultAreaBoundary} from '../../src/components/VaultAreaBoundary';
window.__fail=false;window.__crash=false;window.__loads=1;const put=IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put=function(...args){if(window.__fail&&this.name==='vault')throw new DOMException('Synthetic quota','QuotaExceededError');return put.apply(this,args);};
function Content({vault}){if(window.__crash)throw new Error('Synthetic rendering failure');return <p data-testid="note">{vault.data.clients[0]?.preparation}</p>;}
function Harness(){const vault=useVault();const [,render]=useState(0);window.__vault=vault;window.__render=()=>render(n=>n+1);return vault.data?<VaultAreaBoundary vault={vault} resetKey="test"><Content vault={vault}/></VaultAreaBoundary>:<p>Waiting</p>;}
createRoot(document.getElementById('root')).render(<I18nProvider><Harness/></I18nProvider>);`);
  const port=Number(process.env.PLAYWRIGHT_PORT||4173)+104;
  const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore',env:{...process.env,VITE_BASE_PATH:'/',VITE_SUPABASE_URL:'',VITE_SUPABASE_ANON_KEY:''}});
  const context=await browser.newContext();
  try{
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}expect(ready).toBe(true);
    const page=await context.newPage();await page.goto(`http://127.0.0.1:${port}${directory.slice(process.cwd().length)}/index.html`);
    await expect.poll(()=>page.evaluate(()=>!!(window as any).__vault)).toBe(true);
    await page.evaluate(async()=>{const w=window as any;await w.__vault.create('Synthetic safe recovery passphrase');await w.__vault.update((d:any)=>d.clients.push({id:'test',name:'Test',createdAt:'2026-01-01',language:'de',contact:'',telegramChatId:'',reminderConsent:false,preparation:'Before'}));w.__key=w.__vault.getKey();w.__fail=true;await w.__vault.update((d:any)=>{d.clients[0].preparation='Unsaved synthetic text';}).catch(()=>{});await w.__vault.addFile(new Uint8Array([1,2,3]));w.__crash=true;w.__render();});
    await expect(page.getByRole('heading',{name:de.areaErrorTitle,exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>(window as any).__vault.storageError)).toBe(true);
    expect(await page.evaluate(()=>{const w=window as any;return w.__key===w.__vault.getKey()&&w.__vault.getData().clients[0].preparation==='Unsaved synthetic text';})).toBe(true);
    await page.getByRole('button',{name:de.areaErrorRetry,exact:true}).click();await expect(page.getByRole('alert')).toHaveText(de.areaErrorUnsaved);
    await page.evaluate(()=>{const w=window as any;w.__fail=false;w.__crash=false;});await page.getByRole('button',{name:de.areaErrorRetry,exact:true}).click();await expect(page.getByTestId('note')).toHaveText('Unsaved synthetic text');
    expect(await page.evaluate(()=>{const w=window as any;return w.__key===w.__vault.getKey()&&w.__loads===1;})).toBe(true);
    const backup=await page.evaluate(async()=>(window as any).__vault.exportBackup());expect(JSON.stringify(backup)).not.toContain('Unsaved synthetic text');
  }finally{await context.close();server.kill('SIGTERM');await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else{server.once('exit',()=>resolve());setTimeout(()=>{server.kill('SIGKILL');resolve();},3000).unref();}});await rm(directory,{recursive:true,force:true});}
});
