import { reconcileAppointmentOutcomes } from './cancellations';
import type { PasskeyWrap, VaultData, VaultEnvelope } from './types';
import { reconcileBillingLinks } from './invoice';
import { reconcileReferralStarts } from './referrals';

import { materialize, mergeStates, recordChanges, stateOf } from './crdt';

/** Record causal per-field mutations; no patient data or device clock is sent outside the encrypted payload. */
export const stampChanges = recordChanges;

/** Join multi-value registers. Independent fields and append-only history entries merge automatically.
 * Concurrent alternatives remain encrypted and reviewable rather than being discarded by wall-clock order. */
export function mergeVaults(local: VaultData, remote: VaultData): VaultData {
  const merged = materialize(local, mergeStates(stateOf(local), stateOf(remote)));
  // A session that points at an appointment/invoice which no longer exists must not dangle.
  const invoiceIds = new Set(merged.invoices.map(i => i.id));
  for (const session of merged.sessions) if (session.invoiceId && !invoiceIds.has(session.invoiceId)) delete session.invoiceId;
  const clientIds = new Set(merged.clients.map(c => c.id));
  for (const name of ['appointments', 'sessions', 'notes', 'invoices', 'assessments', 'documents', 'audioMemos', 'sessionDrafts'] as const)
    (merged[name] as { clientId: string }[]) = (merged[name] as { clientId: string }[]).filter(r => clientIds.has(r.clientId));
  const sessions = new Map(merged.sessions.map(s => [s.id, s.clientId]));
  for (const newsletter of merged.newsletters ?? []) newsletter.recipients = newsletter.recipients.filter(r => clientIds.has(r.clientId));
  merged.audioMemos = merged.audioMemos.filter(m => sessions.get(m.sessionId) === m.clientId);
  merged.waitlist = merged.waitlist.filter(w => !w.clientId || clientIds.has(w.clientId));
  merged.followUps = merged.followUps.filter(t => clientIds.has(t.clientId));
  merged.referralCodes = merged.referralCodes.filter(c => clientIds.has(c.clientId));
  merged.referrals = merged.referrals.filter(r => clientIds.has(r.referrerId) && clientIds.has(r.referredId));
  merged.referralPayouts = merged.referralPayouts.filter(p => clientIds.has(p.referrerId));
  reconcileAppointmentOutcomes(merged);
  reconcileBillingLinks(merged);
  reconcileReferralStarts(merged);
  return merged;
}
/** Invoice numbers must be unique for the tax office; two offline devices can still pick the same one. */
export const duplicateInvoiceNumbers = (data: VaultData) => {
  const seen = new Set<string>(); const duplicates = new Set<string>();
  for (const invoice of data.invoices) (seen.has(invoice.number) ? duplicates : seen).add(invoice.number);
  return [...duplicates];
};
/** Combine the key wraps of two copies of an envelope: newest passphrase/recovery wrap wins, passkeys are united minus removed ones. */
export function mergeEnvelopes(local: VaultEnvelope, remote: VaultEnvelope): VaultEnvelope {
  if (!remote.wraps) return local;
  if (!local.wraps) return { ...local, format: 'praxisraum-v2', salt: remote.salt, wraps: remote.wraps };
  const newerPassphrase = (remote.wraps.passphrase.at ?? 0) > (local.wraps.passphrase.at ?? 0) ? remote : local;
  const removed = [...new Set([...local.wraps.removedPasskeys ?? [], ...remote.wraps.removedPasskeys ?? []])];
  const passkeys = new Map<string, PasskeyWrap>();
  for (const passkey of [...remote.wraps.passkeys ?? [], ...local.wraps.passkeys ?? []]) if (!removed.includes(passkey.credentialId)) passkeys.set(passkey.credentialId, passkey);
  const recovery = [local.wraps.recovery, remote.wraps.recovery].filter(Boolean).sort((a, b) => (b!.at ?? 0) - (a!.at ?? 0))[0];
  return { ...local, salt: newerPassphrase.salt, wraps: { passphrase: newerPassphrase.wraps!.passphrase, ...recovery && { recovery }, passkeys: [...passkeys.values()], removedPasskeys: removed } };
}
