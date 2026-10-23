import type { TextKey } from './i18n';
import { addDays, addMonths, isIsoDay, localeFor, today } from './dates';
import { billingConflicts, isSessionVoided } from './invoice';
import { syncConflicts } from './crdt';
import { type Currency, type Language, type Referral, type ReferralPayout, type VaultData } from './types';

export const REFERRAL_CONSENT_VERSION = '2026-10-23' as const;
export const DEFAULT_REFERRAL_TERMS = { rateBps: 1000, months: 12 };
export function referralTerms(data: VaultData) {
  const terms = data.settings.referralProgram ?? DEFAULT_REFERRAL_TERMS;
  if (!Number.isInteger(terms.rateBps) || terms.rateBps < 1 || terms.rateBps > 10000 || !Number.isInteger(terms.months) || terms.months < 1 || terms.months > 60) throw new Error('referralInvalidTerms');
  return { ...terms };
}
export const normalizedCode = (value: string) => value.trim().toUpperCase();
export const validReferralCode = (value: string) => /^PRX-[A-F0-9]{12}$/.test(value);
export function resolveReferralCode(data: VaultData, input: string, referredId?: string) {
  if (syncConflicts(data).some(c => ['referralCodes','referrals'].includes(c.collection))) throw new Error('referralConflict');
  const code = normalizedCode(input);
  if (!validReferralCode(code)) throw new Error('referralInvalidCode');
  const matches = data.referralCodes.filter(c => c.code === code && !c.revokedAt && data.clients.some(client => client.id === c.clientId));
  if (matches.length !== 1) throw new Error('referralInvalidCode');
  if (matches[0].clientId === referredId) throw new Error('referralSelf');
  return matches[0];
}
/** Called only when creating a NEW client, after recording that client's explicit consent. */
export function registerReferral(data: VaultData, referredId: string, input: string, consent: boolean, language: Language, now = new Date().toISOString()) {
  if (!input.trim()) return;
  if (!consent) throw new Error('referralConsentRequired');
  if (!data.clients.some(c => c.id === referredId) || data.referrals.some(r => r.referredId === referredId) || data.sessions.some(s => s.clientId === referredId)) throw new Error('referralAlreadyAssigned');
  const source = resolveReferralCode(data, input, referredId);
  data.referrals.push({ id: `referral:${referredId}`, referrerId: source.clientId, referredId, code: source.code, registeredOn: now.slice(0,10), consentAt: now, consentLanguage: language, consentVersion: REFERRAL_CONSENT_VERSION, ...referralTerms(data) });
}
/** Remember the FIRST payment even if it is later unmarked, reversed, or an old snapshot is restored.
 * Earlier corrected payment dates may move the start earlier, never extend the reward period. */
export function reconcileReferralStarts(data: VaultData, before?: VaultData) {
  if (!data.referrals.length) return;
  const first = new Map<string, string>();
  for (const s of data.sessions) if (s.paidAt && isIsoDay(s.paidAt) && !isSessionVoided(data, s) && (s.billing?.amountCents ?? s.feeCents) > 0) {
    const previous = first.get(s.clientId); if (!previous || s.paidAt < previous) first.set(s.clientId, s.paidAt);
  }
  const old = new Map(before?.referrals.map(r => [r.id, r.firstPaidOn]) ?? []);
  for (const r of data.referrals) {
    const dates = [r.firstPaidOn, old.get(r.id), first.get(r.referredId)].filter((d): d is string => !!d && isIsoDay(d));
    if (dates.length) r.firstPaidOn = dates.sort()[0];
  }
}
export const referralEndExclusive = (r: Referral) => r.firstPaidOn ? addMonths(r.firstPaidOn, r.months) : undefined;
export const referralEndInclusive = (r: Referral) => { const end = referralEndExclusive(r); return end ? addDays(end, -1) : undefined; };
export const referralMoney = (cents: number, language: Language, currency: Currency) => new Intl.NumberFormat(localeFor(language), { style: 'currency', currency, minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
export const referralRate = (bps: number, language: Language) => new Intl.NumberFormat(localeFor(language), { style: 'percent', maximumFractionDigits: 2 }).format(bps / 10000);
// Integer half-up rounding once per referral/currency cumulative balance, never per session.
export function rewardCents(revenue: number, bps: number) {
  if (!Number.isSafeInteger(revenue) || revenue < 0 || !Number.isInteger(bps) || bps < 1 || bps > 10000) throw new Error('referralInvalidAmount');
  const result = Number((BigInt(revenue) * BigInt(bps) + 5000n) / 10000n);
  if (!Number.isSafeInteger(result)) throw new Error('referralInvalidAmount');
  return result;
}
export interface ReferralRow {
  referral: Referral; currency: Currency; revenueCents: number; rewardCents: number; paidCents: number; openCents: number;
  status: 'waiting' | 'active' | 'expired';
}
/** Payouts are blocked for any unresolved referral/financial conflicts. No arbitrary CRDT display variant is paid. */
export function referralHasConflicts(data: VaultData) {
  return syncConflicts(data).some(c => ['referrals', 'referralCodes', 'referralPayouts', 'sessions', 'invoices'].includes(c.collection) || c.collection === 'settings' && c.field === 'referralProgram') || billingConflicts(data).length > 0 || new Set(data.referrals.map(r => r.referredId)).size !== data.referrals.length;
}
export function referralRows(data: VaultData, through = today()): ReferralRow[] {
  const byClient = new Map<string, typeof data.sessions>();
  for (const s of data.sessions) { const group = byClient.get(s.clientId) ?? []; group.push(s); byClient.set(s.clientId, group); }
  const paid = new Map<string, number>();
  for (const payout of data.referralPayouts) for (const allocation of payout.allocations) {
    const key = `${allocation.referralId}:${payout.currency}`; paid.set(key, (paid.get(key) ?? 0) + allocation.amountCents);
  }
  return data.referrals.flatMap(referral => {
    const end = referralEndExclusive(referral); const revenue = { EUR: 0, UAH: 0 };
    if (referral.firstPaidOn && end) for (const s of byClient.get(referral.referredId) ?? []) {
      if (!s.paidAt || s.paidAt < referral.firstPaidOn || s.paidAt >= end || s.paidAt > through || isSessionVoided(data, s)) continue;
      const currency = s.billing?.currency ?? 'EUR'; const amount = s.billing?.amountCents ?? s.feeCents;
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('referralInvalidAmount');
      revenue[currency] += amount;
      if (!Number.isSafeInteger(revenue[currency])) throw new Error('referralInvalidAmount');
    }
    const status = !referral.firstPaidOn || referral.firstPaidOn > through ? 'waiting' : end! > through ? 'active' : 'expired';
    const currencies: Currency[] = (['EUR', 'UAH'] as const).filter(c => revenue[c] > 0 || paid.has(`${referral.id}:${c}`));
    if (!currencies.length) currencies.push(data.clients.find(c => c.id === referral.referredId)?.currency ?? 'EUR');
    return currencies.map(currency => {
      const reward = rewardCents(revenue[currency], referral.rateBps), paidCents = paid.get(`${referral.id}:${currency}`) ?? 0;
      return { referral, currency, revenueCents: revenue[currency], rewardCents: reward, paidCents, openCents: reward - paidCents, status };
    });
  });
}
export function lastCompletedQuarter(day = today()) {
  if (!isIsoDay(day)) throw new Error('invalidDate');
  const [year, month] = day.split('-').map(Number); const start = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  return addDays(start, -1);
}
export const payoutId = (referrerId: string, currency: Currency, through: string) => `referral-payout:${referrerId}:${currency}:${through}`;
export function recordReferralPayout(data: VaultData, referrerId: string, currency: Currency, paidOn: string, now = today()): ReferralPayout {
  if (!isIsoDay(paidOn) || paidOn > now || referralHasConflicts(data)) throw new Error('referralPayoutBlocked');
  const through = lastCompletedQuarter(now), id = payoutId(referrerId, currency, through);
  if (paidOn <= through || data.referralPayouts.some(p => p.id === id)) throw new Error('referralPayoutBlocked');
  const allocations = referralRows(data, through).filter(r => r.referral.referrerId === referrerId && r.currency === currency && r.openCents !== 0).map(r => ({ referralId: r.referral.id, amountCents: r.openCents }));
  const amountCents = allocations.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('referralPayoutBlocked');
  const record = { id, referrerId, currency, through, paidOn, amountCents, allocations };
  data.referralPayouts.push(record); return record;
}
export function reverseReferralPayout(data: VaultData, id: string, now = today()) {
  if (referralHasConflicts(data)) throw new Error('referralPayoutBlocked');
  const original = data.referralPayouts.find(p => p.id === id);
  if (!original || original.reverses || data.referralPayouts.some(p => p.reverses === id)) throw new Error('referralPayoutBlocked');
  data.referralPayouts.push({ ...original, id: `reversal:${id}`, paidOn: now, amountCents: -original.amountCents, allocations: original.allocations.map(a => ({ ...a, amountCents: -a.amountCents })), reverses: id });
}
/** In-app history may restore clinical edits, but must not forget real payouts or reversals.
 * Current entries win over recovered copies with the same immutable booking ID. */
export function restoreReferralPayouts(current: ReferralPayout[], recovered: ReferralPayout[] = []) {
  return structuredClone([...new Map([...recovered, ...current].map(p => [p.id, p])).values()]);
}
/** Portable-client export: never include the other person's ID, sessions or financial history. */
export function clientReferralExport(data: VaultData, clientId: string) {
  return {
    codes: data.referralCodes.filter(c => c.clientId === clientId),
    ownCodeUse: data.referrals.filter(r => r.referredId === clientId).map(({ referrerId: _referrer, id: _id, referredId: _referred, ...r }) => r),
    payouts: data.referralPayouts.filter(p => p.referrerId === clientId).map(({ allocations: _allocations, referrerId: _referrer, id: _id, reverses: _reverses, ...p }) => p),
  };
}

export const referralError = (error: unknown): TextKey => {
  const message = error instanceof Error ? error.message : '';
  return ['referralInvalidCode','referralConsentRequired','referralSelf','referralAlreadyAssigned','referralInvalidTerms','referralInvalidAmount','referralPayoutBlocked','referralSetup','referralConflict','referralCardError'].includes(message) ? message as TextKey : 'storageError';
};
