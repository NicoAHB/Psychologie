import { test, expect } from './fixtures';
import { fakeMemoCapture, recordMemo } from './memo-fixture';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
import { uid } from '../../src/lib/types';

test('memo title choices learn custom names across clients and reloads; overview shows newest dated titles and opens the player', async ({ page }) => {
  test.setTimeout(60000); await fakeMemoCapture(page);
  const { data } = workflowData(), first = data.clients[0]; first.language = 'de'; first.currency = 'EUR'; data.invoices = [];
  for (const session of data.sessions) { delete session.invoiceId; delete session.billing; }
  const second = { ...first, id: uid(), name: 'Zweite Testperson' }; data.clients.push(second);
  data.sessions.push({ ...data.sessions[0], id: uid(), clientId: second.id });
  const read = await seedWorkflow(page, data); await nav(page, 'Klienten'); await page.locator('.directory-list button').filter({ hasText: first.name }).click();
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click();
  await page.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).first().click();
  await recordMemo(page, 'Mein eigener Fokus', 'Von Hand eingetragen');
  await expect.poll(async () => (await read()).settings.memoLabels).toEqual(['Mein eigener Fokus']);
  await page.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).first().click();
  const recorder = page.getByRole('dialog', { name: 'Sprach-Memo aufnehmen', exact: true });
  await recorder.getByRole('button', { name: 'Aufnahme starten', exact: true }).click(); await recorder.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  const choices = recorder.getByLabel('Vorauswahl für die Bezeichnung', { exact: true });
  await choices.selectOption({ label: 'Offene Fragen' }); await expect(recorder.getByLabel('Bezeichnung (optional)', { exact: true })).toHaveValue('Offene Fragen');
  await recorder.getByRole('button', { name: 'Memo übernehmen', exact: true }).click(); await expect(recorder).not.toBeVisible();
  await page.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).first().click(); await recordMemo(page, '');
  await page.getByRole('tab', { name: 'Überblick', exact: true }).click();
  const overview = page.locator('.memo-overview'); await expect(overview.locator('.memo-open')).toHaveCount(3);
  await expect(overview.locator('.memo-open strong')).toHaveText(['Sprach-Memo', 'Offene Fragen', 'Mein eigener Fokus']);
  const latest = (await read()).audioMemos.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  await expect(overview.locator('time').first()).toHaveAttribute('datetime', latest.createdAt); await expect(overview.locator('time').first()).not.toBeEmpty();
  await expect(page.locator('audio')).toHaveCount(0);
  await overview.locator('.memo-open').filter({ hasText: 'Offene Fragen' }).click(); const player = page.getByRole('dialog', { name: 'Offene Fragen', exact: true });
  await expect(player.locator('audio')).toHaveAttribute('src', /^blob:/); await player.getByRole('button', { name: 'Schließen', exact: true }).click();

  await page.getByRole('button', { name: 'Sperren', exact: true }).last().click(); await expect(page.getByRole('heading', { name: 'Willkommen zurück.', exact: true })).toBeVisible();
  await page.reload(); await unlock(page); await nav(page, 'Klienten'); await page.locator('.directory-list button').filter({ hasText: second.name }).click();
  await expect(page.locator('.memo-overview')).toHaveCount(0); // no other client's memos in this overview
  await page.getByRole('tab', { name: 'Besprochen', exact: true }).click(); await page.getByRole('button', { name: 'Sprach-Memo aufnehmen', exact: true }).first().click();
  await recorder.getByRole('button', { name: 'Aufnahme starten', exact: true }).click(); await recorder.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  await choices.selectOption({ label: 'Mein eigener Fokus' }); await expect(recorder.getByLabel('Bezeichnung (optional)', { exact: true })).toHaveValue('Mein eigener Fokus');
  await recorder.getByRole('button', { name: 'Українська', exact: true }).click();
  const ukrainian = page.getByRole('dialog'); await expect(ukrainian.getByLabel('Варіанти назви', { exact: true }).locator('option')).toContainText(['Вибрати варіант …', 'Думки після сесії']);
  await expect(ukrainian.getByLabel('Назва (необов’язково)', { exact: true })).toHaveValue('Mein eigener Fokus');
  await ukrainian.getByRole('button', { name: 'Deutsch', exact: true }).click(); await recorder.getByRole('button', { name: 'Memo übernehmen', exact: true }).click();
  await expect.poll(async () => (await read()).settings.memoLabels).toEqual(['Mein eigener Fokus']);
});
