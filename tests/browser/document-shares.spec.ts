import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, workflowData } from './workflow-fixture';
import { uid } from '../../src/lib/types';
const texts = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;

test('individual document shares stay encrypted in transit; guests download locally with no account and revocation blocks access', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'One isolated source harness checks host and guest; layouts are checked at 390/820 px within it.'); test.setTimeout(90000);
  const port = Number(process.env.PLAYWRIGHT_PORT || 4173) + 104;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: '/', VITE_SUPABASE_URL: 'https://share-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-test-key' } });
  const context = await browser.newContext({ baseURL: `http://127.0.0.1:${port}` }); const packets = new Map<string, { id: string; expires_at: string; payload: unknown }>(); let guestAuth = '';
  await context.route('https://share-test.supabase.co/**', async route => {
    const operation = route.request().url().split('/').at(-1), args = route.request().postDataJSON();
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (operation === 'create_document_share') { expect(JSON.stringify(args.p_payload)).not.toContain('Beispielaufgabe'); expect(JSON.stringify(args.p_payload)).not.toContain('aufgabe.txt'); packets.set(args.p_id, { id: args.p_id, expires_at: args.p_expires_at, payload: args.p_payload }); return json(args.p_id); }
    if (operation === 'read_document_share') { guestAuth = route.request().headers().authorization; return json(packets.get(args.p_id) ?? null); }
    if (operation === 'revoke_document_share') { packets.delete(args.p_id); return json(null); }
    return json({});
  });
  try {
    let ready = false; for (let i = 0; i < 100; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch { /* startup */ } if (ready) break; await new Promise(r => setTimeout(r, 100)); } expect(ready).toBe(true);
    const host = await context.newPage(), { data } = workflowData(); const client = data.clients[0]; client.language = 'de'; data.documents.push({ id: uid(), clientId: client.id, title: 'Übung', createdAt: new Date().toISOString(), file: { blobId: uid(), fileName: 'aufgabe.txt', mimeType: 'text/plain', size: 15 }, returnExpected: false, deliveries: [], returns: [] });
    const read = await seedWorkflow(host, data);
    await host.evaluate(async () => { const path = '/src/lib/cloud.ts', { overrideCloud } = await import(path); overrideCloud({ auth: { getUser: async () => ({ data: { user: { id: 'test-owner' } }, error: null }) }, rpc: async (name: string, body: unknown) => { const response = await fetch(`https://share-test.supabase.co/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { data: await response.json(), error: null }; } }); });
    await nav(host, 'Klienten'); await host.locator('.directory-list button').first().click(); await host.getByRole('tab', { name: /Dokumente/ }).click(); await host.getByRole('button', { name: 'Vertraulicher Dokument-Link', exact: true }).click();
    const dialog = host.getByRole('dialog', { name: 'Vertraulicher Dokument-Link', exact: true });
    expect((await new AxeBuilder({ page: host }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await dialog.getByLabel('Zusätzliche Passphrase (optional)', { exact: true }).fill('Nur für diese Unterlage'); await dialog.getByRole('button', { name: 'Verschlüsselten Link erstellen', exact: true }).click();
    const linkField = dialog.getByLabel('Vertraulicher Link', { exact: true }); await expect(linkField).toBeVisible(); const link = await linkField.inputValue(); expect(new URL(link).search).toBe(''); expect(packets.size).toBe(1); expect((await read()).documents[0].shares?.[0].link).toBe(link);
    // A guest page on the same device must not use a stored therapist auth token.
    await host.evaluate(() => localStorage.setItem('sb-share-test-auth-token', JSON.stringify({ access_token: 'therapist-secret-must-not-be-used', refresh_token: 'not-used', expires_at: 9999999999 })));
    const guest = await context.newPage(); await guest.goto(link); await expect(guest.locator('.share-guest')).toBeVisible(); await expect(guest.locator('.app-shell')).toHaveCount(0);
    await guest.getByLabel('Zusätzliche Passphrase (optional)', { exact: true }).fill('Nur für diese Unterlage'); const downloading = guest.waitForEvent('download'); await guest.getByRole('button', { name: texts.shareDownload, exact: true }).click(); const download = await downloading;
    expect(download.suggestedFilename()).toBe('aufgabe.txt'); expect(await readFile((await download.path())!, 'utf8')).toBe('Beispielaufgabe'); expect(guestAuth).toBe('Bearer public-test-key');
    for (const width of [390, 820]) { await guest.setViewportSize({ width, height: 1180 }); expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    expect((await new AxeBuilder({ page: guest }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click(); await host.getByRole('button', { name: 'Freigabe widerrufen', exact: true }).click(); expect(packets.size).toBe(0);
    await guest.reload(); await guest.getByRole('button', { name: texts.shareDownload, exact: true }).click(); await expect(guest.getByText(texts.shareUnavailable, { exact: true })).toBeVisible();
  } finally { await context.close(); server.kill('SIGTERM'); }
});
