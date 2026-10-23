import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from './fixtures';
import { seedWorkflow, workflowData, nav, unlock } from './workflow-fixture';
import { fakeMemoCapture, memoState, recordMemo, storedMemoBlobs } from './memo-fixture';
import { addDays } from '../../src/lib/dates';

function audioData() {
  const { data } = workflowData(), client = data.clients[0]; data.invoices = []; client.currency = 'EUR'; client.language = 'de';
  for (const s of data.sessions) { delete s.invoiceId; delete s.billing; }
  return { data, client };
}
async function profile(page: Page, name: string) {
  await nav(page, 'Klienten'); const person = page.locator('.directory-list').getByRole('button', { name: new RegExp(name) }); if (await person.isVisible()) await person.click();
}
const recorder = (page: Page) => page.getByRole('dialog', { name: 'Sprach-Memo aufnehmen', exact: true });
async function openNewMemo(page: Page) {
  const dialogs = page.locator('dialog[open]'), scope = await dialogs.count() ? dialogs.last() : page;
  await scope.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).first().click();
}

test('encrypted session memos: create/edit, playback, summaries, search, backup, reload, and permanent deletion including history', async ({ page }) => {
  test.setTimeout(90000); await fakeMemoCapture(page); page.on('dialog', dialog => void dialog.accept());
  const problems: string[] = [], externalAudio: string[] = []; page.on('pageerror', error => problems.push(error.message));
  page.on('request', r => { if (r.resourceType() === 'media' && !r.url().startsWith('blob:') || ['POST', 'PUT'].includes(r.method()) && (r.headers()['content-type'] ?? '').startsWith('audio/')) externalAudio.push(r.url()); });
  const { data, client } = audioData(), read = await seedWorkflow(page, data);
  await profile(page, client.name); await page.getByRole('button', { name: 'Termin nachtragen', exact: true }).click();
  const session = page.getByRole('dialog', { name: 'Termin nachtragen', exact: true });
  await session.getByLabel('Terminnotiz (optional)').fill('Sitzung mit Sprach-Memos'); await openNewMemo(page);
  expect((await memoState(page)).calls).toBe(0); await recordMemo(page, 'Ressourcen-Memo', 'Ручна коротка нотатка: Hoffnung und Ressourcen.');
  await expect(session.locator('.memo-open')).toHaveCount(1); expect(await storedMemoBlobs(page)).toHaveLength(1); // unfinished audio is already encrypted for crash recovery
  expect((await read()).audioMemos).toHaveLength(0); expect((await read()).sessionDrafts[0].payload.memos).toHaveLength(1);
  await session.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(session).not.toBeVisible();
  await expect.poll(async () => (await read()).audioMemos.length).toBe(1); await expect.poll(async () => (await storedMemoBlobs(page)).length).toBe(1);
  await expect(page.locator('.recent-list')).toContainText('Sprach-Memos: 1');
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click(); await expect(page.locator('.memo-open')).toContainText('Ручна коротка нотатка');
  await page.locator('.memo-open').first().click(); const viewer = page.getByRole('dialog', { name: 'Ressourcen-Memo', exact: true });
  await expect(viewer.locator('.memo-summary')).toContainText('Hoffnung und Ressourcen');
  const audio = viewer.locator('audio'); await expect.poll(() => audio.evaluate(n => (n as HTMLAudioElement).readyState)).toBeGreaterThan(0);
  expect(await audio.getAttribute('src')).toMatch(/^blob:/); await viewer.getByLabel('Wiedergabegeschwindigkeit', { exact: true }).selectOption('1.5');
  expect(await audio.evaluate(n => (n as HTMLAudioElement).playbackRate)).toBe(1.5);
  await viewer.getByRole('button', { name: 'Abspielen', exact: true }).click(); await expect(viewer.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => audio.evaluate(n => (n as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await viewer.getByRole('button', { name: 'Pause', exact: true }).click();
  const seek = viewer.getByRole('slider', { name: 'Wiedergabeposition', exact: true }); await seek.focus(); await seek.press('Home'); await seek.press('ArrowRight');
  await expect.poll(() => audio.evaluate(n => (n as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(.09);
  const oldUrl = await audio.getAttribute('src'); await viewer.getByRole('button', { name: 'Schließen', exact: true }).click();
  expect((await memoState(page)).revoked).toContain(oldUrl);

  // New recordings can be attached directly to a session in the discussed timeline.
  await openNewMemo(page); await recordMemo(page, 'Zweites Memo', 'Handschriftlich ergänzte Stichworte');
  await expect.poll(async () => (await read()).audioMemos.length).toBe(2);
  await page.getByRole('button', { name: 'Termin bearbeiten', exact: true }).first().click();
  const edit = page.getByRole('dialog', { name: 'Termin bearbeiten', exact: true }); await expect(edit.locator('.memo-open')).toHaveCount(2);
  await edit.locator('.memo-open').filter({ hasText: 'Ressourcen-Memo' }).click();
  await viewer.getByRole('button', { name: 'Bezeichnung / Kurzfassung bearbeiten', exact: true }).click();
  await viewer.getByLabel('Bezeichnung (optional)', { exact: true }).fill('Ressourcen neu'); await viewer.getByLabel('Kurzfassung', { exact: true }).fill('EinmaligesSuchwort Спокій');
  await viewer.getByRole('button', { name: 'Speichern', exact: true }).click();
  const renamed = page.getByRole('dialog', { name: 'Ressourcen neu', exact: true }); await renamed.getByRole('button', { name: 'Schließen', exact: true }).click();
  await edit.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(edit).not.toBeVisible();

  await page.keyboard.press('Control+k'); const search = page.getByRole('dialog', { name: 'Alles durchsuchen', exact: true });
  await search.getByLabel('Alles durchsuchen', { exact: true }).fill('EinmaligesSuchwort'); await search.locator('.search-results button').first().click();
  await expect(renamed).toBeVisible(); await expect(renamed.locator('.memo-summary')).toContainText('Спокій'); await renamed.getByRole('button', { name: 'Schließen', exact: true }).click();
  await nav(page, 'Einstellungen'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Verschlüsselte Sicherung herunterladen', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await download).path())!, 'utf8')); expect(backup.blobs).toHaveLength(2); expect(JSON.stringify(backup)).not.toMatch(/EinmaligesSuchwort|Ressourcen neu|audio\/webm/);
  const stored = await storedMemoBlobs(page); expect(stored.every(b => Object.keys(b).sort().join() === 'id,payload,vaultId' && !!b.payload.iv && !!b.payload.ciphertext)).toBe(true);
  await page.getByRole('button', { name: 'Sperren', exact: true }).last().click(); await expect(page.getByRole('heading', { name: 'Willkommen zurück.', exact: true })).toBeVisible();
  await page.reload(); await unlock(page); await profile(page, client.name); await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
  await expect(page.locator('.memo-open')).toHaveCount(2); await page.locator('.memo-open').filter({ hasText: 'Ressourcen neu' }).click();
  await expect(renamed.locator('audio')).toHaveAttribute('src', /^blob:/);
  await renamed.getByRole('button', { name: 'Sprach-Memo löschen', exact: true }).click(); await expect(renamed).not.toBeVisible();
  await expect.poll(async () => (await storedMemoBlobs(page)).length).toBe(1);
  // Restoring a pre-deletion session snapshot must not resurrect the erased audio.
  await nav(page, 'Einstellungen'); await page.locator('.passkey-list li', { hasText: 'Vor einer Löschung' }).first().getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
  await expect(page.getByText('Stand wiederhergestellt.', { exact: true })).toBeVisible(); expect((await read()).audioMemos.map(m => m.label)).toEqual(['Zweites Memo']);
  await profile(page, client.name); await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Klient löschen', exact: true }).click();
  await expect.poll(async () => (await storedMemoBlobs(page)).length).toBe(0); expect((await read()).audioMemos).toEqual([]);
  expect(externalAudio).toEqual([]); expect(problems).toEqual([]);
});

test('Safari MP4: repeat/discard, session deletion and undo never restore erased memo blobs', async ({ page }) => {
  await fakeMemoCapture(page, 'mp4'); page.on('dialog', d => void d.accept()); const { data, client } = audioData(), read = await seedWorkflow(page, data);
  await profile(page, client.name); await page.getByRole('tab', { name: 'Besprochen', exact: true }).click(); await openNewMemo(page);
  await recorder(page).getByRole('button', { name: 'Aufnahme starten', exact: true }).click(); await recorder(page).getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  await recorder(page).getByRole('button', { name: 'Wiederholen', exact: true }).click(); await recorder(page).getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  await recorder(page).getByRole('button', { name: 'Verwerfen', exact: true }).click(); await expect(recorder(page)).not.toBeVisible();
  expect((await memoState(page)).stopped).toBe(2); expect(await storedMemoBlobs(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Termin bearbeiten', exact: true }).first().click();
  await openNewMemo(page); await recordMemo(page, 'Safari-Memo');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect((await read()).audioMemos[0].mimeType).toBe('audio/mp4');
  await page.locator('.memo-open').first().click();
  const player = page.getByRole('dialog', { name: 'Safari-Memo', exact: true });
  // Some open Chromium builds lack AAC. WebM playback is exercised unconditionally above;
  // a Safari-format file on such a browser must instead display the localized playback error.
  if (await player.locator('audio').evaluate(n => !!(n as HTMLAudioElement).canPlayType('audio/mp4;codecs="mp4a.40.2"'))) {
    await expect.poll(() => player.locator('audio').evaluate(n => (n as HTMLAudioElement).readyState)).toBeGreaterThan(0);
    await player.getByRole('button', { name: 'Abspielen', exact: true }).click(); await expect(player.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  } else await expect(player.getByRole('alert')).toContainText('nicht geladen oder abgespielt');
  await player.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Termin bearbeiten', exact: true }).first().click(); await page.getByRole('dialog').getByRole('button', { name: 'Termin löschen', exact: true }).click();
  await expect.poll(async () => (await storedMemoBlobs(page)).length).toBe(0);
  await nav(page, 'Einstellungen'); await page.locator('.passkey-list li', { hasText: 'Vor einer Löschung' }).first().getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
  await expect(page.getByText('Stand wiederhergestellt.', { exact: true })).toBeVisible(); expect((await read()).sessions).toHaveLength(2); expect((await read()).audioMemos).toEqual([]);
});

test('microphone denial, size limit and absent MediaRecorder produce translated errors and never store raw audio', async ({ page }) => {
  await fakeMemoCapture(page); const { data, client } = audioData(); await seedWorkflow(page, data); await profile(page, client.name);
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click(); await openNewMemo(page);
  await page.evaluate(() => { (window as unknown as { __memo: { denial: boolean } }).__memo.denial = true; });
  await recorder(page).getByRole('button', { name: 'Aufnahme starten', exact: true }).click(); await expect(recorder(page).getByRole('alert')).toContainText('Mikrofonzugriff wurde verweigert');
  await recorder(page).getByRole('button', { name: 'Українська', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Доступ до мікрофона');
  await page.getByRole('dialog').getByRole('button', { name: 'Deutsch', exact: true }).click();
  await page.evaluate(() => { const state = (window as unknown as { __memo: { denial: boolean; oversize: boolean } }).__memo; state.denial = false; state.oversize = true; });
  await recorder(page).getByRole('button', { name: 'Erneut versuchen', exact: true }).click(); await recorder(page).getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  await expect(recorder(page).getByRole('alert')).toContainText('25 MB'); expect(await storedMemoBlobs(page)).toHaveLength(0);
  await recorder(page).getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: undefined }); });
  await openNewMemo(page); await expect(recorder(page).getByRole('alert')).toContainText('nicht unterstützt'); await expect(recorder(page).getByRole('button', { name: 'Aufnahme starten', exact: true })).toBeDisabled();
});

test('automatic lock immediately stops playback, revokes blob URLs and stops an active microphone', async ({ page }) => {
  await fakeMemoCapture(page); await page.clock.install(); const { data, client } = audioData(); await seedWorkflow(page, data); await profile(page, client.name);
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click(); await openNewMemo(page); await recordMemo(page, 'Lock-Memo');
  await page.locator('.memo-open').first().click(); const viewer = page.getByRole('dialog', { name: 'Lock-Memo', exact: true });
  await expect.poll(() => viewer.locator('audio').evaluate(n => (n as HTMLAudioElement).readyState)).toBeGreaterThan(0);
  await viewer.getByRole('button', { name: 'Abspielen', exact: true }).click(); const url = await viewer.locator('audio').getAttribute('src');
  await page.clock.fastForward(11 * 60000); await expect(page.getByRole('heading', { name: 'Willkommen zurück.', exact: true })).toBeVisible();
  expect((await memoState(page)).revoked).toContain(url); await expect(page.locator('audio')).toHaveCount(0);
  await unlock(page); await profile(page, client.name); await page.getByRole('tab', { name: 'Besprochen', exact: true }).click(); await openNewMemo(page);
  await recorder(page).getByRole('button', { name: 'Aufnahme starten', exact: true }).click(); const stopped = (await memoState(page)).stopped;
  await page.clock.fastForward(11 * 60000); await expect(page.getByRole('heading', { name: 'Willkommen zurück.', exact: true })).toBeVisible();
  expect((await memoState(page)).stopped).toBeGreaterThan(stopped); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the service worker never puts an audio response into Cache Storage', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.route('**/test-memo.webm', route => route.fulfill({ contentType: 'audio/webm', body: 'synthetic, never patient audio' }));
  await page.evaluate(async () => { await fetch('/test-memo.webm'); });
  const paths = await page.evaluate(async () => { const paths: string[] = []; for (const key of await caches.keys()) for (const r of await (await caches.open(key)).keys()) paths.push(r.url); return paths; });
  expect(paths.some(path => path.endsWith('/test-memo.webm'))).toBe(false);
});

test('long timelines and memo lists are bounded; search opens a memo on a later session page', async ({ page }) => {
  const { data, client } = audioData(), template = data.sessions[0];
  data.sessions = Array.from({ length: 61 }, (_, i) => ({ ...template, id: `session-${i}`, date: addDays('2026-10-20', -i) }));
  const make = (id: string, sessionId: string, summary = '') => ({ id, sessionId, clientId: client.id, blobId: `blob-${id}`, label: id, summary, createdAt: '2026-10-22T10:00:00Z', mimeType: 'audio/webm', size: 4, durationMs: 1000 });
  data.audioMemos = [...Array.from({ length: 12 }, (_, i) => make(`memo-${i}`, 'session-0')), make('Altes Memo', 'session-60', 'FindeMichGanzHinten')];
  await seedWorkflow(page, data); await profile(page, client.name); await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
  await expect(page.locator('.timeline-entry')).toHaveCount(50); await expect(page.locator('.memo-open')).toHaveCount(10);
  await page.getByRole('button', { name: 'Weitere Sprach-Memos anzeigen', exact: true }).click(); await expect(page.locator('.memo-open')).toHaveCount(12);
  await page.keyboard.press('Control+k'); const search = page.getByRole('dialog', { name: 'Alles durchsuchen', exact: true });
  await search.getByLabel('Alles durchsuchen', { exact: true }).fill('FindeMichGanzHinten'); await search.locator('.search-results button').first().click();
  const opened = page.getByRole('dialog', { name: 'Altes Memo', exact: true }); await expect(opened.locator('.memo-summary')).toContainText('FindeMichGanzHinten');
  await opened.getByRole('button', { name: 'Schließen', exact: true }).click(); await expect(page.locator('.timeline-entry')).toHaveCount(11);
  await expect(page.getByText('Seite 2 von 2', { exact: true })).toBeVisible();
});

test('unlock completes interrupted orphan cleanup while preserving referenced encrypted memo files', async ({ page }) => {
  await fakeMemoCapture(page); const { data, client } = audioData(); await seedWorkflow(page, data); await profile(page, client.name);
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click(); await openNewMemo(page); await recordMemo(page, 'Bleibt erhalten');
  const [file] = await storedMemoBlobs(page);
  await page.evaluate(async file => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('praxisraum', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => {
      const tx = db.transaction(['blobs', 'meta'], 'readwrite');
      tx.objectStore('blobs').put({ ...file, id: 'interrupted-orphan' }, 'interrupted-orphan');
      tx.objectStore('meta').put([file.id, 'interrupted-orphan'], `blob-cleanup:${file.vaultId}`);
      tx.oncomplete = () => { db.close(); resolve(); };
    });
  }, file);
  await page.reload(); await unlock(page); await expect.poll(async () => (await storedMemoBlobs(page)).length).toBe(1);
  expect((await storedMemoBlobs(page))[0].id).toBe(file.id); await profile(page, client.name); await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
  await page.locator('.memo-open').first().click(); await expect(page.getByRole('dialog', { name: 'Bleibt erhalten', exact: true }).locator('audio')).toHaveAttribute('src', /^blob:/);
});
