import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
import { uid } from '../../src/lib/types';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;

test('a verified encrypted backup restores a document and playable memo in a separate browser profile', async ({ page, browser }, info) => {
  test.setTimeout(90000); const { data, client } = workflowData();
  data.documents.push({ id: uid(), clientId: client.id, title: 'Testunterlage', createdAt: new Date().toISOString(), file: { blobId: uid(), fileName: 'aufgabe.txt', mimeType: 'text/plain', size: 15 }, returnExpected: false, deliveries: [], returns: [] });
  const mp4 = info.project.name.includes('webkit');
  const bytes = await readFile(new URL(mp4 ? './assets/memo.m4a' : './assets/memo.webm', import.meta.url));
  data.audioMemos.push({ id: uid(), clientId: client.id, sessionId: data.sessions[0].id, blobId: uid(), createdAt: new Date().toISOString(), mimeType: mp4 ? 'audio/mp4' : 'audio/webm', size: bytes.length, durationMs: 3000, label: 'Testmemo', summary: 'Manuelle Testnotiz' });
  const read = await seedWorkflow(page, data); await expect(page.locator('.sync-bar')).toContainText(de.saved); const before = await read(); await nav(page, de.settings);
  const card = page.locator('#settings-backup'); await expect(card.locator('.backup-proof')).toContainText(de.backupProofNever);
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: de.exportBackup, exact: true }).click()]); const file = await readFile((await download.path())!);
  expect(file.toString()).not.toContain('Manuelle Testnotiz');
  await card.getByRole('button', { name: de.backupVerify, exact: true }).click(); const verify = page.getByRole('dialog', { name: de.backupVerify, exact: true });
  await verify.getByLabel(de.backupVerifyFile, { exact: true }).setInputFiles({ name: 'encrypted.json', mimeType: 'application/json', buffer: file });
  await verify.getByLabel(de.backupVerifyPassphrase, { exact: true }).fill('wrong'); await verify.getByRole('button', { name: de.backupVerify, exact: true }).click(); await expect(verify.getByRole('alert')).toBeVisible();
  await verify.getByRole('button', { name: de.close, exact: true }).last().click(); await expect(card.locator('.backup-proof time')).toHaveCount(0);
  await card.getByRole('button', { name: de.backupVerify, exact: true }).click();
  await verify.getByLabel(de.backupVerifyFile, { exact: true }).setInputFiles({ name: 'encrypted.json', mimeType: 'application/json', buffer: file });
  await verify.getByLabel(de.backupVerifyPassphrase, { exact: true }).fill('a very strong test passphrase'); await verify.getByRole('button', { name: de.backupVerify, exact: true }).click();
  await expect(verify).toContainText(de.backupVerified.split('{clients}')[0], { timeout: 15000 }); await verify.getByRole('button', { name: de.close, exact: true }).last().click(); await expect(card.locator('.backup-proof time')).toHaveCount(1);
  const other = await browser.newContext();
  try {
    await other.route('https://bank.gov.ua/**', route => route.fulfill({ json: [{ cc: 'EUR', rate: 48, exchangedate: '26.10.2026' }] }));
    const second = await other.newPage(); await second.goto(new URL('/', page.url()).href);
    await second.locator('input[type=file]').setInputFiles({ name: 'encrypted.json', mimeType: 'application/json', buffer: file }); await unlock(second);
    await nav(second, de.clients); await second.locator('.directory-list button').first().click(); await second.getByRole('tab', { name: de.clientDocuments, exact: true }).click(); await expect(second.getByRole('heading', { name: 'Testunterlage', exact: true })).toBeVisible();
    const [document] = await Promise.all([second.waitForEvent('download'), second.getByRole('button', { name: 'aufgabe.txt', exact: true }).click()]); expect(await readFile((await document.path())!, 'utf8')).toBe('Beispielaufgabe');
    await second.getByRole('tab', { name: de.tabDiscussed, exact: true }).click(); await second.getByRole('button', { name: /Testmemo/ }).first().click();
    const player = second.getByRole('dialog'); await expect(player.locator('audio')).toHaveAttribute('src', /^blob:/); await player.getByRole('button', { name: de.memoPlay, exact: true }).click();
    await expect.poll(() => player.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  } finally { await other.close(); }
  await card.getByRole('button', { name: de.backupRecoveryGuide, exact: true }).click(); const recovery = page.getByRole('dialog', { name: de.backupRecoveryGuide, exact: true });
  await expect(recovery.getByRole('button', { name: de.backupRecoveryConfirm, exact: true })).toBeDisabled();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  for (const label of [de.backupRecoveryDevice, de.backupRecoveryImported, de.backupRecoveryFiles]) await recovery.getByRole('checkbox', { name: label, exact: true }).check();
  await recovery.getByRole('button', { name: de.backupRecoveryConfirm, exact: true }).click(); await expect(card.locator('.backup-proof time')).toHaveCount(2); expect(await read()).toEqual(before);
  await page.reload(); await unlock(page); await nav(page, de.settings); await expect(card.locator('.backup-proof time')).toHaveCount(2);
});

test('rare pages are deferred, newsletter drafts survive navigation and unopened modules remain available offline', async ({ page, context }) => {
  test.setTimeout(90000); const { data } = workflowData(); await seedWorkflow(page, data);
  const loaded = () => page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  expect((await loaded()).some(name => /\/(Newsletter|Referrals|MarketingCampaigns|TemplateManager)-/.test(name))).toBe(false);
  await nav(page, de.newsletter); await page.getByLabel(de.marketingMessageDe, { exact: true }).fill('Ein Entwurf bleibt beim Wechsel erhalten.');
  expect((await loaded()).some(name => /\/Newsletter-/.test(name))).toBe(true);
  await nav(page, de.messageTemplates); await expect(page.getByRole('heading', { name: de.messageTemplates, exact: true })).toBeVisible(); await nav(page, de.newsletter); await expect(page.getByLabel(de.marketingMessageDe, { exact: true })).toHaveValue('Ein Entwurf bleibt beim Wechsel erhalten.');
  await nav(page, de.settings); const version = page.getByRole('region', { name: de.appVersionTitle, exact: true }); await expect(version).toContainText('0.2.0');
  await page.getByRole('button', { name: 'Українська', exact: true }).first().click(); await expect(page.getByRole('region', { name: uk.appVersionTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Deutsch', exact: true }).first().click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.reload(); await unlock(page); await context.setOffline(true);
  await nav(page, de.referrals); await expect(page.getByRole('heading', { name: de.referrals, exact: true })).toBeVisible();
  await nav(page, de.marketingCampaigns); await expect(page.getByRole('heading', { name: de.marketingCampaigns, exact: true })).toBeVisible();
  await nav(page, de.settings); await expect(page.getByRole('region', { name: de.appVersionTitle, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
