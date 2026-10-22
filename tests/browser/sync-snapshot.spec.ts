import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('sync snapshots keep ciphertext and file references paired through queued edits and stale React renders', async ({ browser }, info) => {
  test.skip(info.project.name === 'mobile', 'This test exercises the same hook/worker queue independently of viewport.');
  const directory = await mkdtemp(`${process.cwd()}/tests/runtime-snapshot-`);
  const path = `${directory}/harness.tsx`;
  await writeFile(path, `import { createRoot } from 'react-dom/client';
import { useVault } from '../../src/lib/useVault';
function Harness() { window.__snapshotVault = useVault(); return <div/>; }
const node = document.createElement('div'); document.body.append(node); createRoot(node).render(<Harness/>);`);
  const port = Number(process.env.PLAYWRIGHT_PORT || 4173) + 101;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: '/', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
  const context = await browser.newContext();
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch { /* booting */ } if (ready) break; await new Promise(r => setTimeout(r, 100)); }
    expect(ready).toBe(true); const page = await context.newPage(); await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(async path => { await import(path); }, path.slice(process.cwd().length));
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { __snapshotVault?: unknown }).__snapshotVault)).toBe(true);
    const result = await page.evaluate(async () => {
      type Controller = import('../../src/lib/useVault').VaultController;
      const vault = (window as unknown as { __snapshotVault: Controller }).__snapshotVault;
      await vault.create('a sufficiently strong snapshot test passphrase');
      const blobId = await vault.addFile(new TextEncoder().encode('Encrypted attachment'));
      const first = vault.update(d => { d.clients.push({ id: 'client', name: 'Synthetic client', language: 'de', contact: '', preparation: 'First note', createdAt: '2026-01-01', telegramChatId: '', reminderConsent: false, avatarId: blobId }); });
      const pending = vault.snapshotForSync();
      const second = vault.update(d => { d.clients[0].preparation = 'Second queued note'; });
      await Promise.all([first, second]); const snapshot = await pending;
      const third = vault.update(d => { d.clients[0].preparation = 'Later note outside the captured snapshot'; });
      const cryptoPath = '/src/lib/crypto.ts'; const { decryptVault } = await import(cryptoPath);
      const decrypted = await decryptVault(vault.getKey()!, snapshot.envelope);
      await third; const latest = await vault.snapshotForSync();
      return { snapshot: snapshot.data, decrypted, snapshotGeneration: snapshot.generation, latestGeneration: latest.generation, latestNote: latest.data.clients[0].preparation, blobId };
    });
    expect(result.decrypted).toEqual(result.snapshot); expect(result.snapshot.clients[0].preparation).toBe('Second queued note');
    expect(result.snapshot.clients[0].avatarId).toBe(result.blobId); expect(result.latestNote).toBe('Later note outside the captured snapshot'); expect(result.latestGeneration).toBeGreaterThan(result.snapshotGeneration);
  } finally { await context.close(); server.kill('SIGTERM'); await rm(directory, { recursive: true, force: true }); }
});
