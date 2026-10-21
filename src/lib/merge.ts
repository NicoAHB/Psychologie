import type { PasskeyWrap, VaultData, VaultEnvelope } from './types';
import { reconcileBillingLinks } from './invoice';

const COLLECTIONS = ['clients', 'appointments', 'sessions', 'notes', 'invoices', 'assessments', 'templates', 'documents', 'availability'] as const;
type Collection = typeof COLLECTIONS[number];
type Record_ = { id: string; updatedAt?: number };
const TOMBSTONE_DAYS = 400;

const without = (record: object) => JSON.stringify(record, (key, value) => key === 'updatedAt' ? undefined : value);

/**
 * Stamp what a change touched: new or modified records get `updatedAt`, removed records leave a tombstone.
 * Called with the vault before and after an edit, so individual screens never have to think about it.
 */
export function stampChanges(before: VaultData, after: VaultData, now: number) {
  for (const name of COLLECTIONS) {
    const previous = new Map((before[name] as Record_[]).map(record => [record.id, without(record)]));
    const kept = new Set<string>();
    for (const record of after[name] as Record_[]) {
      kept.add(record.id);
      if (previous.get(record.id) !== without(record)) record.updatedAt = now;
    }
    for (const id of previous.keys()) if (!kept.has(id)) after.deleted[id] = now;
  }
  const settings = (value: VaultData) => JSON.stringify(value.settings, (key, v) => key === 'updatedAt' ? undefined : v);
  if (settings(before) !== settings(after)) after.settings.updatedAt = now;
  const limit = now - TOMBSTONE_DAYS * 864e5;
  for (const [id, at] of Object.entries(after.deleted)) if (at < limit) delete after.deleted[id];
}

/**
 * Combine two copies of one vault. Per record the newer `updatedAt` wins; a deletion beats an older edit and an
 * edit beats an older deletion. Records unknown to one side are added. On ties the local copy is kept.
 */
export function mergeVaults(local: VaultData, remote: VaultData): VaultData {
  const deleted: Record<string, number> = { ...remote.deleted };
  for (const [id, at] of Object.entries(local.deleted)) deleted[id] = Math.max(at, deleted[id] ?? 0);
  const merged = structuredClone(local) as VaultData;
  for (const name of COLLECTIONS) {
    const byId = new Map<string, Record_>();
    for (const record of remote[name] as Record_[]) byId.set(record.id, record);
    for (const record of local[name] as Record_[]) {
      const other = byId.get(record.id);
      if (!other || (record.updatedAt ?? 0) >= (other.updatedAt ?? 0)) byId.set(record.id, record);
    }
    const list = [...byId.values()].filter(record => !(record.id in deleted) || (record.updatedAt ?? 0) > deleted[record.id]);
    // Keep the local order first so lists do not jump around after a merge.
    const order = new Map((local[name] as Record_[]).map((record, index) => [record.id, index]));
    (merged[name] as Record_[]) = list.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  }
  merged.deleted = deleted;
  // A return uploaded on one device must not erase an email receipt recorded on the other device.
  // These histories are append-only; an accepted receipt always wins over its earlier pending version.
  merged.documents = structuredClone(merged.documents);
  for (const document of merged.documents) {
    const copies = [...local.documents, ...remote.documents].filter(d => d.id === document.id);
    const deliveries = new Map(document.deliveries.map(d => [d.id, d]));
    const returns = new Map(document.returns.map(r => [r.id, r]));
    const telegram = new Map((document.telegramDeliveries ?? []).map(d => [d.id, d]));
    for (const copy of copies) {
      for (const delivery of copy.deliveries) {
        const current = deliveries.get(delivery.id);
        if (!current || !current.acceptedAt && delivery.acceptedAt) deliveries.set(delivery.id, delivery);
      }
      for (const returned of copy.returns) if (!returns.has(returned.id)) returns.set(returned.id, returned);
      for (const delivery of copy.telegramDeliveries ?? []) {
        const current = telegram.get(delivery.id);
        if (!current || !current.acceptedAt && delivery.acceptedAt) telegram.set(delivery.id, delivery);
      }
    }
    document.deliveries = [...deliveries.values()]; document.returns = [...returns.values()];
    if (telegram.size) document.telegramDeliveries = [...telegram.values()];
  }
  if ((remote.settings.updatedAt ?? 0) > (local.settings.updatedAt ?? 0)) merged.settings = { ...structuredClone(remote.settings), autoSync: local.settings.autoSync };
  // A session that points at an appointment/invoice which no longer exists must not dangle.
  const invoiceIds = new Set(merged.invoices.map(i => i.id));
  for (const session of merged.sessions) if (session.invoiceId && !invoiceIds.has(session.invoiceId)) delete session.invoiceId;
  const clientIds = new Set(merged.clients.map(c => c.id));
  for (const name of ['appointments', 'sessions', 'notes', 'invoices', 'assessments', 'documents'] as const)
    (merged[name] as { clientId: string }[]) = (merged[name] as { clientId: string }[]).filter(r => clientIds.has(r.clientId));
  reconcileBillingLinks(merged);
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
