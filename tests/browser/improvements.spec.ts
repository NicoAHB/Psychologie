import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';

test('iPad fallback checkpoints are encrypted, downloadable and survive reload; client ZIP stays readable and isolated', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
  const { data, client } = workflowData(); data.invoices = []; data.sessions = [];
  data.clients.push({ ...client, id: 'another-person', name: 'OTHER PERSON SECRET' });
  data.documents.push({ id: 'task', clientId: client.id, title: 'Aufgabe', createdAt: '2026-10-01', file: { blobId: 'original-file', fileName: 'aufgabe.txt', mimeType: 'text/plain', size: 15 }, returnExpected: false, deliveries: [], returns: [] });
  const read = await seedWorkflow(page, data);
  await nav(page, 'Klienten'); await page.locator('.directory-list').getByRole('button', { name: /Олена Приклад/ }).click();
  const preparation = page.getByRole('textbox', { name: 'Vorbereitung für die nächste Sitzung', exact: true });
  await preparation.fill('PRIVATE RECOVERY CHECKPOINT'); await preparation.blur();
  await expect.poll(async () => (await read()).clients.find(item => item.id === client.id)?.preparation).toBe('PRIVATE RECOVERY CHECKPOINT');
  await nav(page, 'Einstellungen'); await expect(page.getByText(/Safari auf dem iPad kann keine Sicherungsdatei/)).toBeVisible();
  const history = page.locator('section', { has: page.getByRole('heading', { name: 'In-App-Sicherungshistorie', exact: true }) });
  await expect(history).toContainText('Automatische In-App-Sicherung');
  const download = page.waitForEvent('download'); await history.getByRole('button', { name: /^Sicherung herunterladen / }).first().click();
  const backup = JSON.parse(await readFile((await (await download).path())!, 'utf8')); expect(backup.envelope.payload.ciphertext).toBeTruthy(); expect(backup.blobs).toHaveLength(1); expect(JSON.stringify(backup)).not.toContain('PRIVATE RECOVERY');
  const meta = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('praxisraum', 1); request.onsuccess = () => resolve(request.result); }); return new Promise<string>(resolve => { const request = db.transaction('meta').objectStore('meta').getAll(); request.onsuccess = () => { db.close(); resolve(JSON.stringify(request.result)); }; }); });
  expect(meta).not.toContain('PRIVATE RECOVERY'); expect(meta).not.toContain('olena@example.com');
  await page.reload(); await unlock(page); await nav(page, 'Klienten'); await page.locator('.directory-list').getByRole('button', { name: /Олена Приклад/ }).click(); await expect(preparation).toHaveValue('PRIVATE RECOVERY CHECKPOINT');
  await page.getByRole('button', { name: 'Datenexport (ZIP)', exact: true }).click(); const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('unverschlüsselt');
  const zipDownload = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Lesbare ZIP herunterladen', exact: true }).click();
  const files = unzipSync(await readFile((await (await zipDownload).path())!)); const exported = JSON.parse(strFromU8(files['daten.json']));
  expect(exported.client.name).toBe(client.name); expect(exported.client.preparation).toBe('PRIVATE RECOVERY CHECKPOINT'); expect(Object.values(files).map(bytes => strFromU8(bytes)).join('\n')).not.toContain('OTHER PERSON SECRET'); expect(strFromU8(files[exported.documents[0].path])).toBe('Beispielaufgabe');
});

test('60-minute locking survives reload and locks on return after inactivity, while manual locking remains immediate', async ({ page }) => {
  await page.clock.install(); const { data } = workflowData(); await seedWorkflow(page, data); await nav(page, 'Einstellungen');
  await page.getByLabel('Automatisch sperren nach', { exact: true }).selectOption('60');
  await expect(page.locator('.sync-bar')).toContainText('Auf diesem Gerät gespeichert');
  await page.reload(); await unlock(page); await nav(page, 'Einstellungen'); await expect(page.getByLabel('Automatisch sperren nach', { exact: true })).toHaveValue('60');
  await page.clock.fastForward(11 * 60 * 1000); await expect(page.locator('.app-shell')).toBeVisible();
  await page.clock.fastForward(50 * 60 * 1000); await expect(page.getByRole('heading', { name: 'Willkommen zurück.', exact: true })).toBeVisible();
  await unlock(page); await page.getByRole('button', { name: 'Sperren', exact: true }).last().click(); await expect(page.getByRole('heading', { name: 'Willkommen zurück.', exact: true })).toBeVisible();
});

test('only the base font is precached; a PDF with a Greek name fetches and caches its full fonts at runtime', async ({ page }) => {
  const { data } = workflowData(); data.settings.practice.name = 'Δοκιμή'; data.invoices[0].sender.name = 'Δοκιμή'; await seedWorkflow(page, data);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const fonts = () => page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat().filter(path => path.endsWith('.ttf')));
  const initial = await fonts(); expect(initial).toHaveLength(1); expect(initial[0]).toMatch(/DejaVuSans-Base-/);
  await page.locator('.follow-up-invoices').getByRole('button').click(); const dialog = page.getByRole('dialog');
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'PDF herunterladen', exact: true }).click(); await download;
  const cached = await fonts(); expect(cached.some(path => /DejaVuSans-Bold-[^-]+\.ttf/.test(path))).toBe(true); expect(cached.some(path => /DejaVuSans-[^-]+\.ttf/.test(path))).toBe(true);
});

test('a failed public-rate refresh reuses a dated NBU rate from IndexedDB and preserves manual edits', async ({ page }) => {
  const { data } = workflowData(); data.settings.exchangeRate = undefined; await seedWorkflow(page, data); await nav(page, 'Einstellungen');
  await expect(page.getByLabel('Wechselkurs EUR → UAH', { exact: true })).toHaveValue('48,1256');
  await page.route('https://bank.gov.ua/**', route => route.abort('failed')); await page.getByRole('button', { name: 'Offiziellen Tageskurs laden', exact: true }).click();
  await expect(page.getByText(/Lokal gespeicherter Kurs verwendet/)).toBeVisible(); await expect(page.getByLabel('Wechselkurs EUR → UAH', { exact: true })).toHaveValue('48,1256');
  await page.getByLabel('Wechselkurs EUR → UAH', { exact: true }).fill('51'); await expect(page.getByText(/Lokal gespeicherter Kurs verwendet/)).toHaveCount(0);
});
