import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { nav, seedWorkflow, unlock, workflowData } from './workflow-fixture';
import { today, addDays } from '../../src/lib/dates';
import { uid, type Client } from '../../src/lib/types';
const de = JSON.parse(await readFile(new URL('../../src/locales/de.json', import.meta.url), 'utf8')) as Record<string, string>;
const uk = JSON.parse(await readFile(new URL('../../src/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;

test('five main destinations and More remain reachable in both languages on portrait screens', async ({ page }, info) => {
  test.setTimeout(90000);
  if (!/mobile|iphone/.test(info.project.name)) await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/'); await page.getByRole('button', { name: de.demo, exact: true }).click();
  for (const [language, words] of [['de', de], ['uk', uk]] as const) {
    if (language === 'uk') await page.getByRole('button', { name: 'Українська', exact: true }).first().click();
    const buttons = page.locator('.sidebar nav button > span');
    await expect(buttons).toHaveText(['overview', 'clients', 'appointments', 'finances', 'more'].map(key => words[key]));
    await nav(page, words.more);
    await expect(page.locator('.more-navigation button')).toHaveCount(5);
    for (const route of ['settings', 'newsletter', 'marketingCampaigns', 'messageTemplates', 'referrals']) {
      await nav(page, words[route]);
      await expect(page.locator('.sidebar nav [aria-current="page"]')).toHaveText(words.more);
      await expect(page.getByRole('heading', { name: words[route === 'settings' ? 'settingsTitle' : route], exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: words.backToMore, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await nav(page, words.overview);
    await expect(page.locator('.today-appointments .btn-primary')).toHaveCount(1);
    await expect(page.locator('.today-payments .btn-primary')).toHaveCount(1);
    await expect(page.locator('main')).not.toContainText(language === 'de' ? /Sitzung/ : /сесі[яїюй]/i);
  }
});

test('appointment completion creates an open payment, payment is separate, and backfill stays available', async ({ page }) => {
  test.setTimeout(90000);
  const { data, client, invoice } = workflowData(); (client as Client).currency = 'EUR';
  // The practice can already be on the next day while the CI/device is still on UTC's prior day.
  const practiceDay = new Intl.DateTimeFormat('sv-SE', { timeZone: data.settings.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const appointment = { id: uid(), clientId: client.id, date: practiceDay, time: '09:00', duration: 50, feeCents: 8500, timeZone: data.settings.timeZone, reminderId: uid(), status: 'scheduled' as const };
  data.appointments.push(appointment, { ...appointment, id: uid(), date: addDays(practiceDay, 2), reminderId: uid() });
  const read = await seedWorkflow(page, data);
  await expect(page.locator('.today-appointments .appointment-row')).toHaveCount(2);
  await expect(page.locator('.today-payments .follow-up-invoices')).toContainText(invoice.number);
  await expect(page.locator('.today-appointments')).not.toContainText(invoice.number);
  await expect(page.locator('.work-care')).not.toContainText(de.workInvoice);
  await expect(page.locator('.follow-up-board .follow-up-invoices')).toHaveCount(0);
  await nav(page, de.appointments);
  await page.getByRole('button', { name: de.completeAppointment, exact: true }).first().click();
  const form = page.getByRole('dialog', { name: de.completeAppointment, exact: true });
  await expect(form.getByRole('checkbox', { name: de.paid, exact: true })).toHaveCount(0);
  await expect(form).toContainText(de.completionPaymentHint);
  await form.getByLabel(de.sessionNotes, { exact: true }).fill('Dokumentation des heutigen Termins');
  await form.getByRole('button', { name: de.completeAppointment, exact: true }).click();
  await expect(form).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByRole('status').filter({ hasText: de.appointmentCompletedOpen })).toBeVisible();
  const state = await read(); const completed = state.sessions.find(s => s.appointmentId === appointment.id)!;
  expect(completed.paidAt).toBeNull(); expect(completed.notes).toBe('Dokumentation des heutigen Termins');
  expect(state.appointments.find(a => a.id === appointment.id)?.status).toBe('completed');
  await page.getByRole('button', { name: de.goToPayments, exact: true }).click();
  await expect(page.locator('.finance-open li').filter({ hasText: '09:00' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: de.addSession, exact: true })).toHaveCount(0);
  await expect(page.locator('.finance-history')).not.toHaveAttribute('open');
  await page.locator('.finance-history > summary').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.finance-records')).toBeVisible();
  const payment = page.locator('.open-payment-list li').filter({ hasText: '09:00' });
  await payment.getByRole('button', { name: new RegExp(`^${de.markPaid}:`) }).click();
  const paymentForm = page.getByRole('dialog');
  await paymentForm.getByRole('button', { name: de.paymentSave, exact: true }).click();
  await expect(paymentForm).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.open-payment-list li').filter({ hasText: '09:00' })).toHaveCount(0);
  await page.getByRole('button', { name: de.lock, exact: true }).last().click(); await page.reload(); await unlock(page);
  expect((await read()).sessions.find(s => s.id === completed.id)?.paidAt).toBe(today());
  await nav(page, de.appointments); await page.getByRole('button', { name: de.addSession, exact: true }).click();
  const backfill = page.getByRole('dialog', { name: de.addSession, exact: true });
  await backfill.getByLabel(de.sessionNotes, { exact: true }).fill('Nachträglich dokumentierter Termin');
  await backfill.getByRole('button', { name: de.save, exact: true }).click();
  await expect(backfill).toHaveCount(0, { timeout: 15000 });
  const after = await read(); expect(after.sessions).toHaveLength(data.sessions.length + 2);
  expect(after.sessions.at(-1)?.paidAt).toBeNull(); expect(after.sessions.at(-1)?.appointmentId).toBeUndefined();
});

test('Today groups midnight appointments by the practice day rather than the device day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T23:30:00Z') });
  const { data, client } = workflowData(); data.settings.timeZone = 'Europe/Berlin';
  const appointment = { id: uid(), clientId: client.id, date: '2026-10-23', time: '23:45', duration: 50, feeCents: 8500, timeZone: 'UTC', reminderId: uid(), status: 'scheduled' as const };
  data.appointments.push(appointment, { ...appointment, id: uid(), date: '2026-10-24', time: '23:30', reminderId: uid() });
  await seedWorkflow(page, data);
  const appointments = page.locator('.today-appointments');
  await expect(appointments.locator('.today-subheading').first()).toContainText('24. Oktober');
  await expect(appointments.locator('.appointment-list').first().locator('.appointment-row')).toHaveCount(1);
  await expect(appointments.locator('.appointment-list').first().locator('.time-pair strong').first()).toHaveText('01:45');
  await expect(appointments.getByRole('button', { name: de.completeAppointment, exact: true })).toHaveCount(1);
  await expect(appointments.locator('.appointment-list').nth(1).locator('.time-pair strong').first()).toHaveText('01:30');
});
