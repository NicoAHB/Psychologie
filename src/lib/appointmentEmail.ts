import { appointmentEnd, appointmentInstant, appointmentStart, reminderInstant, zonedInstant } from './dates';
import { icsCalendar } from './ics';
import { translate } from './i18n';
import { confirmationFor } from './zones';
import { sendDocumentEmail, validEmail } from './documents';
import type { Appointment, AppointmentEmailDelivery, Client, VaultData } from './types';
import type { VaultController } from './useVault';
export type AppointmentEmailPurpose = AppointmentEmailDelivery['purpose'];
export const hasAppointmentEmailConsent = (client: Client) => !!(client.appointmentEmailConsent && !client.appointmentEmailConsent.revokedAt && validEmail(client.email?.trim() ?? '') && client.appointmentEmailConsent.destination === client.email?.trim());
export function appointmentEmailSignature(data: VaultData, appointment: Appointment, purpose: AppointmentEmailPurpose): string {
  const client = data.clients.find(c => c.id === appointment.clientId); if (!client || !hasAppointmentEmailConsent(client)) throw new Error('appointmentEmailConsentMissing');
  return JSON.stringify([appointment.id, appointment.date, appointment.time, appointment.timeZone, appointment.duration, client.appointmentEmailConsent!.id, client.email!.trim(), client.language, client.timeZone ?? data.settings.timeZone, data.settings.timeZone, data.settings.practice.name, purpose]);
}
export function emailReminderDue(appointment: Appointment, now = Date.now()) {
  return appointment.status === 'scheduled' && now >= Date.parse(reminderInstant(appointment)) && now < Date.parse(zonedInstant(appointment.date, '00:00', appointment.timeZone));
}
/** Stable UUID for a particular consent, schedule revision and purpose: provider retry keys match across devices. */
export async function appointmentEmailId(signature: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`praxisraum/appointment-email/v1/${signature}`))).slice(0, 16); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, v => v.toString(16).padStart(2, '0')).join(''); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function prepareAppointmentEmail(data: VaultData, appointmentId: string, purpose: AppointmentEmailPurpose, now = new Date().toISOString()): Promise<AppointmentEmailDelivery> {
  const appointment = data.appointments.find(a => a.id === appointmentId);
  if (!appointment || appointment.status !== 'scheduled' || appointmentStart(appointment) <= Date.parse(now) || !['appointmentConfirmation','appointmentReminder'].includes(purpose)) throw new Error('quickPaymentUnavailable');
  if (purpose === 'appointmentReminder' && !emailReminderDue(appointment,Date.parse(now))) throw new Error('quickPaymentUnavailable');
  const signature = appointmentEmailSignature(data, appointment, purpose); const id = await appointmentEmailId(signature);
  const previous = appointment.emailDeliveries?.find(d => d.id === id); if (previous) return structuredClone(previous);
  const client = data.clients.find(c => c.id === appointment.clientId)!; const language = client.language;
  const subject = translate(language, purpose); const body = `${translate(language, purpose === 'appointmentConfirmation' ? 'appointmentEmailGreetingConfirmation' : 'appointmentEmailGreetingReminder')}\n\n${confirmationFor(appointment, client, data.settings)}\n\n${translate(language,'appointmentEmailClosing')}`;
  const title = `${translate(language, 'appointmentWord')}${data.settings.practice.name ? ` – ${data.settings.practice.name}` : ''}`;
  return { id, recipient: client.email!.trim(), requestedAt: now, subject, body, consentId: client.appointmentEmailConsent!.id, signature, purpose, state: 'sending', calendar: icsCalendar([{ uid: appointment.id, start: appointmentInstant(appointment), end: new Date(appointmentEnd(appointment)).toISOString(), summary: title }], title, now) };
}
type DeliveryVault = Pick<VaultController, 'getData' | 'update' | 'getKey' | 'demo'>;
const activeSends = new Set<string>();
/** Explicit plaintext exception: minimal consented email + calendar, never notes, fees or vault keys. */
export async function dispatchAppointmentEmail(vault: DeliveryVault, appointmentId: string, purpose: AppointmentEmailPurpose, options: { signal?: AbortSignal; automatic?: boolean; transport?: typeof sendDocumentEmail; now?: string } = {}) {
  const data = vault.getData(), key = vault.getKey(); if (!data || !key || vault.demo) throw new Error('locked');
  const prepared = await prepareAppointmentEmail(data, appointmentId, purpose, options.now);
  const lockName = `praxisraum-email-${prepared.id}`;
  const run = async () => {
    if (activeSends.has(lockName)) throw new Error('working'); activeSends.add(lockName);
    const active = () => !options.signal?.aborted && vault.getKey() === key && !!vault.getData();
    try {
      if (!active()) throw new Error('locked');
      let delivery = prepared;
      await vault.update(d => {
        const a = d.appointments.find(a => a.id === appointmentId); if (!a || a.status !== 'scheduled' || appointmentEmailSignature(d,a,purpose) !== prepared.signature) throw new Error('appointmentEmailConsentMissing');
        const stored = a.emailDeliveries?.find(r => r.id === prepared.id); if (stored) delivery = structuredClone(stored);
        if (delivery.acceptedAt) return;
        // Automatic runs never retry an uncertain attempt. Explicit retries retain exact original bytes/id.
        if (stored && options.automatic) throw new Error('appointmentEmailUnknown');
        if (Date.parse(options.now ?? new Date().toISOString()) - Date.parse(delivery.requestedAt) >= 23 * 3600000) throw new Error('emailRetryExpired');
        if (!stored) (a.emailDeliveries ??= []).push(delivery);
      });
      if (delivery.acceptedAt) return delivery;
      if (!active()) throw new Error('locked');
      const current = vault.getData()!; const appointment = current.appointments.find(a => a.id === appointmentId);
      if (!appointment || appointment.status !== 'scheduled' || purpose === 'appointmentReminder' && !emailReminderDue(appointment, Date.parse(options.now ?? new Date().toISOString())) || appointmentEmailSignature(current,appointment,purpose) !== delivery.signature) throw new Error('appointmentEmailConsentMissing');
      const blob = new Blob([delivery.calendar], { type: 'text/calendar' });
      const receipt = await (options.transport ?? sendDocumentEmail)(delivery, { blobId: '', fileName: 'termin.ics', mimeType: 'text/calendar', size: blob.size }, blob, options.signal);
      if (active()) await vault.update(d => { const record = d.appointments.find(a => a.id === appointmentId)?.emailDeliveries?.find(r => r.id === delivery.id); if (record) Object.assign(record, receipt, { state: 'sent' }); });
      return { ...delivery, ...receipt, state: 'sent' as const };
    } catch (error) {
      if (active()) await vault.update(d => { const record = d.appointments.find(a => a.id === appointmentId)?.emailDeliveries?.find(r => r.id === prepared.id); if (record && !record.acceptedAt) record.state = 'unknown'; }).catch(() => {});
      throw error;
    } finally { activeSends.delete(lockName); }
  };
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(lockName, { mode: 'exclusive', signal: options.signal }, run) : run();
}
