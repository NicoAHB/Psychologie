import { metaGet, metaPut } from './db';
import { fetchNbuRate, validRate } from './currency';
import type { ExchangeRate } from './types';

const KEY = 'public:nbu:EUR-UAH:v1';
export const rateDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export async function cachedRates(): Promise<ExchangeRate[]> {
  const value = await metaGet<unknown>(KEY);
  return Array.isArray(value) ? value.filter((rate): rate is ExchangeRate => validRate(rate) && rate.source === 'nbu').sort((a, b) => b.date.localeCompare(a.date)) : [];
}
export async function cacheRate(rate: ExchangeRate) {
  if (!validRate(rate) || rate.source !== 'nbu') return;
  const previous = await cachedRates();
  await metaPut(KEY, [rate, ...previous.filter(old => old.date !== rate.date)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90));
}
let inFlight: Promise<ExchangeRate> | undefined;
/** Public rates only: no client data, identifiers or bank accounts leave the device. Manual choices stay explicit. */
export async function loadNbuRate(fallback?: ExchangeRate, force = false, request?: typeof fetch): Promise<{ rate: ExchangeRate; cached: boolean }> {
  const stored = await cachedRates().catch(() => []);
  const today = rateDay();
  if (!force && stored[0]?.date === today) return { rate: stored[0], cached: true };
  try {
    const live = request ? fetchNbuRate(request) : (inFlight ??= fetchNbuRate().finally(() => { inFlight = undefined; }));
    const rate = await live; await cacheRate(rate).catch(() => {});
    return { rate, cached: false };
  } catch {
    const candidates = [...stored, ...(validRate(fallback) ? [fallback] : [])].filter(rate => rate.date <= today).sort((a, b) => b.date.localeCompare(a.date));
    if (!candidates.length) throw new Error('rateLoadFailed');
    return { rate: candidates[0], cached: true };
  }
}
