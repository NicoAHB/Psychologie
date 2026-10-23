import { test, expect } from './fixtures';
import { seedWorkflow, workflowData, nav } from './workflow-fixture';
import { materialize, mergeStates, recordChanges, stateOf } from '../../src/lib/crdt';

test('real workers encrypt notes and generate a PDF without fetching fonts on the UI thread', async ({ page }) => {
  const workers: string[] = []; page.on('worker', worker => workers.push(worker.url()));
  const { data, client, invoice } = workflowData(); const read = await seedWorkflow(page, data);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (input, init) => { if (String(input).includes('.ttf')) throw new Error('Fonts must load inside the PDF worker'); return original(input, init); };
  });
  await nav(page, 'Klienten'); await page.locator('.directory-list').getByRole('button', { name: new RegExp(client.name) }).click();
  await page.getByRole('tab', { name: 'Besprochen' }).click(); await page.getByRole('button', { name: 'Termin bearbeiten' }).first().click();
  const dialog = page.getByRole('dialog'); await dialog.getByLabel('Terminnotiz (optional)').fill('Worker-geschützte Notiz'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  expect((await read()).sessions.some(s => s.notes === 'Worker-geschützte Notiz')).toBe(true);
  await nav(page, 'Zahlungen'); await page.locator('.invoice-list').getByRole('button', { name: `Rechnung öffnen ${invoice.number}`, exact: true }).click();
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'PDF herunterladen', exact: true }).click(); await download;
  expect(workers.some(url => /secure\.worker-/.test(url))).toBe(true); await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('the guest page never opens the therapist vault', async ({ page }) => {
  await seedWorkflow(page, workflowData().data);
  await page.goto('/#video=invalid'); await expect(page.getByRole('heading', { name: 'Videosprechstunde' })).toBeVisible();
  await expect(page.getByText('Dieser Einladungslink ist ungültig.')).toBeVisible(); await expect(page.locator('.app-shell')).toHaveCount(0); await expect(page.getByLabel('Tresor-Passphrase', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Українська', exact: true }).click(); await expect(page.getByText('Недійсне посилання-запрошення.')).toBeVisible();
});

test('directory auto-backup writes complete encrypted copies after edits', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'Directory access is a desktop capability.');
  await page.addInitScript(() => {
    const w = window as unknown as { __directoryCopies: Record<string, string>; showDirectoryPicker: () => Promise<unknown> }; w.__directoryCopies = {};
    w.showDirectoryPicker = async () => ({ kind: 'directory', name: 'Praxis-Sicherungsordner', queryPermission: async () => 'granted',
      getFileHandle: async (name: string) => ({ name, createWritable: async () => { let value = ''; return { write: async (text: string) => { value = text; }, close: async () => { w.__directoryCopies[name] = value; }, abort: async () => {} }; } }),
      async *entries() { for (const name of Object.keys(w.__directoryCopies)) yield [name, { kind: 'file' }]; }, removeEntry: async (name: string) => { delete w.__directoryCopies[name]; } });
  });
  const { data } = workflowData(); await seedWorkflow(page, data); await nav(page, 'Einstellungen');
  await page.getByRole('button', { name: 'Sicherungsordner wählen' }).click(); await expect(page.getByText('Praxis-Sicherungsordner')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as { __directoryCopies: object }).__directoryCopies).length)).toBeGreaterThan(0);
  const copies = await page.evaluate(() => Object.values((window as unknown as { __directoryCopies: Record<string, string> }).__directoryCopies));
  expect(JSON.parse(copies[0]).envelope.payload.ciphertext.length).toBeGreaterThan(100); expect(copies[0]).not.toContain('Олена'); expect(copies[0]).not.toContain('Sitzungsnotiz');
});

test('concurrent text variants are visible and choosing the displayed variant resolves the conflict persistently', async ({ page }) => {
  const { data, client } = workflowData(); data.crdt = stateOf(data);
  const a = structuredClone(data), b = structuredClone(data); a.clients[0].preparation = 'Vorbereitung vom Laptop'; b.clients[0].preparation = 'Vorbereitung vom Smartphone';
  recordChanges(data, a, 10, 'laptop'); recordChanges(data, b, 20, 'phone');
  const merged = materialize(a, mergeStates(stateOf(a), stateOf(b))); const read = await seedWorkflow(page, merged);
  await page.getByRole('button', { name: 'Änderungen zusammenführen' }).click(); const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Vorbereitung vom Laptop', { exact: true })).toBeVisible(); await expect(dialog.getByText('Vorbereitung vom Smartphone', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Variante übernehmen 2' }).click(); await expect(dialog).not.toBeVisible();
  const saved = await read(); expect(saved.clients.find(c => c.id === client.id)?.preparation).toBe('Vorbereitung vom Smartphone');
  await page.reload(); await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase'); await page.getByRole('button', { name: 'Praxisraum öffnen', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible(); await expect(page.getByRole('button', { name: 'Änderungen zusammenführen' })).toHaveCount(0);
});
