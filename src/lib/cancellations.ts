import { releaseSlot } from './waitlist';
import { billAmount, currencyOf } from './currency';
import { completedSessionId } from './practiceFlow';
import type { Appointment, Billing, VaultData } from './types';
export type FailureStatus = 'noShow' | 'lateCancelled';
export function cancellationDefault(data: VaultData, appointment: Appointment) {
  const client = data.clients.find(c => c.id === appointment.clientId);
  const value = client?.cancellationFee ?? { currency: 'EUR' as const, amountCents: data.settings.defaultCancellationFeeCents ?? 0 };
  return { value: value.amountCents, inputCurrency: value.currency, currency: appointment.billing?.currency ?? currencyOf(client), rate: appointment.billing?.rate ?? data.settings.exchangeRate };
}
/** One charge per appointment; a fee is NOT a completed clinical encounter. */
export function recordAppointmentFailure(data: VaultData, appointmentId: string, status: FailureStatus, pricing?: { feeCents: number; billing?: Billing }) {
  const appointment = data.appointments.find(a => a.id === appointmentId);
  if (!appointment || !['noShow', 'lateCancelled'].includes(status) || !data.clients.some(c => c.id === appointment.clientId)) throw new Error('required');
  if (data.sessions.some(s => s.appointmentId === appointmentId) || appointment.status !== 'scheduled') throw new Error('quickPaymentUnavailable');
  if (data.sessionDrafts.some(d => d.appointmentId === appointmentId && !d.originalSessionId)) throw new Error('quickPaymentDraft');
  if (pricing && (!Number.isSafeInteger(pricing.feeCents) || pricing.feeCents < 0 || pricing.feeCents % 100 || pricing.billing && (!Number.isSafeInteger(pricing.billing.amountCents) || pricing.billing.amountCents < 0 || pricing.billing.amountCents % 100))) throw new Error('invalidAmount');
  if (status === 'lateCancelled') releaseSlot(appointment);
  appointment.status = status;
  if (pricing && (pricing.billing?.amountCents ?? pricing.feeCents) > 0) data.sessions.push({ id: completedSessionId(appointmentId), appointmentId, clientId: appointment.clientId, date: appointment.date, time: appointment.time, ...structuredClone(pricing), kind: 'cancellationFee', failureStatus: status, paidAt: null, notes: '', tags: [] });
}
export function failurePricing(data: VaultData, appointment: Appointment) {
  const defaults = cancellationDefault(data, appointment);
  return billAmount(defaults.value, defaults.inputCurrency, defaults.currency, defaults.rate);
}
/** Outcome follows the selected financial variant; competing variants remain available for review. */
export function reconcileAppointmentOutcomes(data: VaultData) {
  for (const session of data.sessions) if (session.appointmentId && session.id === completedSessionId(session.appointmentId)) {
    const appointment = data.appointments.find(a => a.id === session.appointmentId);
    if (appointment) appointment.status = session.kind === 'cancellationFee' ? session.failureStatus ?? 'noShow' : 'completed';
  }
}
