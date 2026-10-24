import { today, isIsoDay } from './dates';
import type { PaymentMethod, Session, Settings, VaultData } from './types';
import type { BackupState } from './backupState';

export type SettingsSection = 'practice' | 'banks' | 'backup' | 'cloud' | 'reminders' | 'appearance' | 'security' | 'email';
export const completedSessionId = (appointmentId: string) => `completed-${appointmentId}`;

/** One durable vault mutation. Stable IDs also coalesce simultaneous offline quick-completions. */
export function completeAndPay(data: VaultData, appointmentId: string, method: PaymentMethod, paidOn = today()): Session {
  if (!['cash', 'transfer'].includes(method) || !isIsoDay(paidOn) || paidOn > today()) throw new Error('required');
  const appointment = data.appointments.find(a => a.id === appointmentId);
  if (!appointment || !data.clients.some(c => c.id === appointment.clientId)) throw new Error('required');
  const existing = data.sessions.find(s => s.appointmentId === appointmentId);
  // A delayed click/retry must never overwrite an existing payment, invoice or clinical record.
  if (existing) { if (!existing.paidAt || existing.kind === 'cancellationFee' || appointment.status !== 'completed') throw new Error('quickPaymentUnavailable'); return existing; }
  if (data.sessionDrafts.some(d => d.appointmentId === appointmentId && !d.originalSessionId)) throw new Error('quickPaymentDraft');
  if (appointment.status !== 'scheduled') throw new Error('quickPaymentUnavailable');
  const session: Session = {
    id: completedSessionId(appointmentId), appointmentId, clientId: appointment.clientId,
    date: appointment.date, time: appointment.time, feeCents: appointment.feeCents,
    ...(appointment.billing && { billing: structuredClone(appointment.billing) }),
    ...(appointment.originalFeeCents !== undefined && { originalFeeCents: appointment.originalFeeCents }),
    paidAt: paidOn, paymentMethod: method, notes: '', tags: [],
  };
  data.sessions.push(session); appointment.status = 'completed'; return session;
}

export interface SetupItem { id: 'practice' | 'banks' | 'backup' | 'cloud' | 'reminders'; done: boolean; optional: boolean; target: SettingsSection }
/** Completion describes setup, never promises that an external service actually delivered anything. */
export function setupItems(settings: Settings, backup: BackupState | null | undefined): SetupItem[] {
  return [
    { id: 'practice', done: !!(settings.practice.name.trim() && settings.practice.address.trim()), optional: false, target: 'practice' },
    { id: 'banks', done: !!(settings.practice.iban.trim() || settings.practice.ibanUa?.trim()), optional: false, target: 'banks' },
    { id: 'backup', done: !!backup, optional: false, target: 'backup' },
    { id: 'cloud', done: settings.autoSync || backup?.kind === 'cloud' || !!settings.skipCloudSetup, optional: true, target: 'cloud' },
    { id: 'reminders', done: settings.remindersEnabled || !!settings.autoEmailReminders || !!settings.skipReminderSetup, optional: true, target: 'reminders' },
  ];
}
