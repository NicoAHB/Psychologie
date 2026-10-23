import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { fakeMemoCapture } from './memo-fixture';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';

// Keep remote Safari failures diagnosable even when CI artifacts cannot be downloaded
// from a restricted developer environment. This fixture contains fictitious data only.
test.afterEach(async ({ page }, info) => {
  if (!info.project.name.includes('webkit') || !info.errors.length || page.isClosed()) return;
  const state = await Promise.race([page.evaluate(() => ({
    visible: document.visibilityState, focused: document.hasFocus(), viewport: { width: innerWidth, height: innerHeight, scale: visualViewport?.scale },
    active: document.activeElement?.tagName,
    recorder: String(globalThis.MediaRecorder).slice(0, 100),
    capture: (window as unknown as { __memo?: unknown }).__memo,
    dialogs: [...document.querySelectorAll('dialog')].map(d => ({ open: d.open, text: d.innerText.slice(-700), rect: d.getBoundingClientRect().toJSON() })),
    alerts: [...document.querySelectorAll('[role=alert]')].map(n => n.textContent?.slice(0, 300)),
    saving: document.querySelector('.sync-bar')?.textContent,
    buttons: [...document.querySelectorAll<HTMLButtonElement>('.memo-labels-card button, .settings-card button')].filter(b => /Sicherung|Vorschlag/.test(b.ariaLabel ?? b.textContent ?? '')).slice(0, 10).map(b => ({ name: b.ariaLabel ?? b.textContent, disabled: b.disabled, rect: b.getBoundingClientRect().toJSON() })),
    text: document.body.innerText.slice(-900),
  })), new Promise(resolve => setTimeout(() => resolve('Page did not respond within five seconds'), 5000))]);
  throw new Error(`Safari diagnostic (synthetic test data): ${JSON.stringify(state)}`);
});

test('pause, completion and reactivation keep the full client record; filters and due follow-ups work', async ({ page }) => {
  const { data, client } = workflowData(); const read = await seedWorkflow(page, data);
  await nav(page, 'Klienten'); await page.locator('.directory-list button').first().click();
  await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Begleitungsstatus', { exact: true }).selectOption('paused'); await dialog.getByLabel('Wiedervorlage am', { exact: true }).fill('2020-01-01'); await dialog.getByLabel('Anlass der Wiedervorlage', { exact: true }).fill('Nach Pause Kontakt aufnehmen'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('.client-status-card')).toContainText('Pausiert'); await expect.poll(async () => (await read()).clients[0].status).toBe('paused');
  const paused = await read(); expect(paused.sessions).toHaveLength(data.sessions.length); expect(paused.invoices).toHaveLength(1);
  await nav(page, 'Übersicht'); await expect(page.locator('.work-board')).toContainText('Nach Pause Kontakt aufnehmen');
  await page.getByRole('button', { name: 'Wiedervorlage erledigt', exact: true }).click(); await expect(page.locator('.work-board')).not.toContainText('Nach Pause Kontakt aufnehmen');
  await nav(page, 'Klienten'); if (!await page.getByLabel('Klienten anzeigen', { exact: true }).isVisible()) await page.getByRole('button', { name: 'Alle Klienten', exact: true }).click(); await page.getByLabel('Klienten anzeigen', { exact: true }).selectOption('active'); await expect(page.locator('.directory-list button')).toHaveCount(0);
  await page.getByLabel('Klienten anzeigen', { exact: true }).selectOption('paused'); await page.locator('.directory-list button').first().click();
  await page.getByRole('button', { name: 'Begleitung wieder aktivieren', exact: true }).click(); await expect.poll(async () => (await read()).clients[0].status).toBe('active');
  await nav(page, 'Klienten'); if (!await page.getByLabel('Klienten anzeigen', { exact: true }).isVisible()) await page.getByRole('button', { name: 'Alle Klienten', exact: true }).click(); await page.getByLabel('Klienten anzeigen', { exact: true }).selectOption('active'); await expect(page.locator('.directory-list')).toContainText(client.name); await page.locator('.directory-list button').first().click();
  await expect(page.locator('.client-status-card')).toContainText('Verlauf der Begleitung'); await page.getByRole('button', { name: 'Sperren', exact: true }).last().click(); await page.reload(); await unlock(page);
  expect((await read()).clients[0].statusHistory?.map(h => h.status)).toEqual(['active', 'paused', 'active']);
});

test('encrypted session drafts recover text and a stopped memo after reload, lock and offline work without creating charges', async ({ page }, info) => {
  test.setTimeout(60000); if (!/mobile|iphone/.test(info.project.name)) await page.setViewportSize({ width: 820, height: 1180 }); await fakeMemoCapture(page, 'mp4');
  const { data } = workflowData(); data.clients[0].currency = 'EUR'; const read = await seedWorkflow(page, data);
  await nav(page, 'Klienten'); await page.locator('.directory-list button').first().click(); await page.getByRole('button', { name: 'Sitzung erfassen', exact: true }).first().click();
  const session = page.getByRole('dialog', { name: 'Sitzung erfassen', exact: true }); await session.getByLabel('Sitzungsnotiz (optional)', { exact: true }).fill('Entwurf bleibt nach Safari-Neustart');
  await session.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).click(); const recorder = page.getByRole('dialog', { name: 'Sprach-Memo aufnehmen', exact: true });
  await recorder.getByRole('button', { name: 'Aufnahme starten', exact: true }).click(); await expect(recorder.getByRole('button', { name: 'Aufnahme stoppen', exact: true })).toBeVisible({ timeout: 10000 }); await recorder.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  await recorder.getByLabel('Bezeichnung (optional)', { exact: true }).fill('Noch nicht abgeschlossene Sitzung'); await recorder.getByLabel('Kurzfassung', { exact: true }).fill('Manuelle Kurzfassung im Entwurf');
  await expect.poll(async () => (await read()).sessionDrafts[0]?.payload.memos[0]?.summary).toBe('Manuelle Kurzfassung im Entwurf');
  expect((await read()).sessions).toHaveLength(data.sessions.length); expect((await read()).audioMemos).toHaveLength(0);
  // Do not press "Memo übernehmen": stopping and the metadata pause already checkpointed the audio.
  await page.reload(); await unlock(page); await page.getByRole('button', { name: /^Entwurf fortsetzen:/ }).click();
  await expect(session.getByLabel('Sitzungsnotiz (optional)', { exact: true })).toHaveValue('Entwurf bleibt nach Safari-Neustart'); await expect(session.locator('.memo-open')).toContainText('Noch nicht abgeschlossene Sitzung');
  await session.locator('.memo-open').click(); const memo = page.getByRole('dialog', { name: 'Noch nicht abgeschlossene Sitzung', exact: true }); await expect(memo.locator('audio')).toHaveAttribute('src', /^blob:/); await expect(memo).toContainText('Manuelle Kurzfassung im Entwurf'); await memo.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.context().setOffline(true); await session.getByLabel('Sitzungsnotiz (optional)', { exact: true }).fill('Auch offline fortgesetzt');
  // A lock must flush the pending debounce immediately.
  await page.evaluate(() => (document.querySelector('.header-actions button[title="Sperren"]') as HTMLButtonElement).click()); await expect(page.locator('.welcome-page')).toBeVisible();
  await page.context().setOffline(false); await unlock(page); await page.getByRole('button', { name: /^Entwurf fortsetzen:/ }).click(); await expect(session.getByLabel('Sitzungsnotiz (optional)', { exact: true })).toHaveValue('Auch offline fortgesetzt');
  await session.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(session).not.toBeVisible();
  await expect.poll(async () => (await read()).sessionDrafts.length).toBe(0); const saved = await read(); expect(saved.audioMemos).toHaveLength(1); expect(saved.sessions).toHaveLength(data.sessions.length + 1); expect(saved.sessions.at(-1)?.notes).toBe('Auch offline fortgesetzt');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('vocabulary management and backup verification dialogs are accessible in both themes', async ({ page }) => {
  // Three axe scans on the full settings page are substantially slower in WebKit.
  // Keep individual interactions bounded below; allow time for the audit itself.
  test.setTimeout(150000);
  const { data } = workflowData(); data.settings.memoLabels = ['Mein Vorschlag']; const read = await seedWorkflow(page, data); await nav(page, 'Einstellungen');
  const card = page.locator('.memo-labels-card'); await card.getByRole('button', { name: 'Als Favorit markieren: Mein Vorschlag', exact: true }).click();
  await expect.poll(async () => (await read()).settings.memoLabelFavorites).toEqual(['own:mein vorschlag']);
  await card.getByRole('button', { name: 'Vorschlag umbenennen: Mein Vorschlag', exact: true }).click(); const rename = page.getByRole('dialog', { name: 'Vorschlag umbenennen', exact: true });
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  for (const theme of ['dark', 'light']) { await page.evaluate(t => document.documentElement.dataset.theme = t, theme); expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]); }
  await rename.getByLabel('Neue Bezeichnung', { exact: true }).fill('Neuer Vorschlag'); await rename.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(rename).not.toBeVisible(); await expect(card).toContainText('Neuer Vorschlag');
  await card.getByRole('button', { name: 'Vorschlag entfernen: Neuer Vorschlag', exact: true }).click({ timeout: 10000 }); await expect(card).not.toContainText('Neuer Vorschlag'); await expect.poll(async () => (await read()).settings.memoLabels).toEqual([]);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: 'Verschlüsselte Sicherung herunterladen', exact: true }).click({ timeout: 10000 })]); const backupPath = (await download.path())!;
  const before = await read();
  await page.getByRole('button', { name: 'Sicherung prüfen', exact: true }).click({ timeout: 10000 }); const verify = page.getByRole('dialog', { name: 'Sicherung prüfen', exact: true }); await expect(verify).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]); await verify.getByLabel('Verschlüsselte Sicherungsdatei', { exact: true }).setInputFiles(backupPath); await verify.getByLabel('Passphrase dieser Sicherung', { exact: true }).fill('a very strong test passphrase'); await verify.getByRole('button', { name: 'Sicherung prüfen', exact: true }).click(); await expect(verify).toContainText('Prüfung erfolgreich'); expect(await read()).toEqual(before); await verify.getByRole('button', { name: 'Schließen', exact: true }).last().click({ timeout: 10000 });
});
