import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
test('an update waits for real encrypted persistence and never activates after a quota failure', async ({ browser }, info) => {
  test.skip(info.project.name === 'mobile', 'The persistence hook and activation gate are independent of viewport.'); test.setTimeout(90000);
  const directory = await mkdtemp(`${process.cwd()}/tests/runtime-update-`), path = `${directory}/harness.tsx`;
  await writeFile(`${directory}/index.html`, '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Update test</title></head><body><div id="root"></div><script type="module" src="./harness.tsx"></script></body></html>');
  await writeFile(path, `import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../src/lib/i18n';
import {UpdateBanner} from '../../src/components/UpdateBanner';
import {registerServiceWorker} from '../../src/lib/updates';
import {flushBeforeLock} from '../../src/lib/autoLock';
import {useVault} from '../../src/lib/useVault';
window.__activations=0;window.__failWrites=false;
const original=IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put=function(...args){if(window.__failWrites&&this.name==='vault')throw new DOMException('Synthetic full disk','QuotaExceededError');return original.apply(this,args);};
Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{controller:{},addEventListener(){},register:async()=>({waiting:{postMessage(){window.__activations++;}},addEventListener(){},update:async()=>{}})}});
registerServiceWorker('/synthetic-sw.js','/');
function Harness(){const vault=useVault();window.__releaseVault=vault;return vault.data?<><label>Synthetic note<input value={vault.data.clients[0]?.preparation??''} onChange={e=>{const text=e.target.value;void vault.update(d=>{if(d.clients[0])d.clients[0].preparation=text;}).catch(()=>{});}}/></label><p>{vault.storageError?'synthetic-storage-error':''}</p><UpdateBanner beforeApply={async()=>{await flushBeforeLock();await vault.flush();}}/></>:<p>Waiting for synthetic vault</p>;}
createRoot(document.getElementById('root')!).render(<I18nProvider><Harness/></I18nProvider>);`);
  const port = Number(process.env.PLAYWRIGHT_PORT || 4173) + 102;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host','127.0.0.1','--port',String(port),'--strictPort'], { stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: '/', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
  const context = await browser.newContext();
  try {
    let ready = false; for (let i = 0; i < 100; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch { /* starting */ } if (ready) break; await new Promise(r => setTimeout(r,100)); } expect(ready).toBe(true);
    const page = await context.newPage(); await page.goto(`http://127.0.0.1:${port}${directory.slice(process.cwd().length)}/index.html`);
    await expect.poll(() => page.evaluate(() => !!(window as unknown as {__releaseVault?: unknown}).__releaseVault)).toBe(true);
    await page.evaluate(async () => { const v = (window as unknown as { __releaseVault: import('../../src/lib/useVault').VaultController }).__releaseVault; await v.create('a strong synthetic update passphrase'); await v.update(d => { d.clients.push({ id:'synthetic',name:'Synthetic person',contact:'',preparation:'Before',language:'de',createdAt:'2026-01-01',telegramChatId:'',reminderConsent:false }); }); });
    await expect(page.getByLabel('Synthetic note')).toHaveValue('Before'); await page.evaluate(() => { (window as unknown as {__failWrites:boolean}).__failWrites=true; });
    await page.getByLabel('Synthetic note').fill('Unsaved synthetic note'); await expect(page.getByText('synthetic-storage-error',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:de.updateApply,exact:true}).click(); await expect(page.getByRole('alert')).toHaveText(de.updateSaveFailed);
    expect(await page.evaluate(() => (window as unknown as {__activations:number}).__activations)).toBe(0); await expect(page.getByLabel('Synthetic note')).toHaveValue('Unsaved synthetic note');
    await page.evaluate(async () => { (window as unknown as {__failWrites:boolean}).__failWrites=false; await (window as unknown as {__releaseVault:import('../../src/lib/useVault').VaultController}).__releaseVault.retry(); });
    await page.getByRole('button',{name:de.updateApply,exact:true}).click(); await expect.poll(() => page.evaluate(() => (window as unknown as {__activations:number}).__activations)).toBe(1);
    const backup = await page.evaluate(async () => (window as unknown as {__releaseVault:import('../../src/lib/useVault').VaultController}).__releaseVault.exportBackup()); expect(JSON.stringify(backup)).not.toContain('Unsaved synthetic note');
  } finally { await context.close(); server.kill('SIGTERM'); await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', () => resolve()); setTimeout(() => { server.kill('SIGKILL'); resolve(); },3000).unref(); } }); await rm(directory,{recursive:true,force:true}); }
});
