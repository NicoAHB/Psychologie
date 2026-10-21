import type { BankAccount, Billing, Client, Currency, ExchangeRate, PracticeProfile } from './types';

export const RATE_SCALE = 1_000_000;
export const currencyOf = (client?: Pick<Client, 'currency'>): Currency => client?.currency ?? 'EUR';
export const wholeCents = (cents: number) => Math.round(cents / 100) * 100;
export function validRate(rate?: ExchangeRate): rate is ExchangeRate {
  return !!rate && Number.isSafeInteger(rate.micros) && rate.micros > 0 && rate.micros <= 1_000_000 * RATE_SCALE &&
    /^\d{4}-\d{2}-\d{2}$/.test(rate.date) && !Number.isNaN(Date.parse(`${rate.date}T00:00:00Z`)) && new Date(`${rate.date}T00:00:00Z`).toISOString().slice(0, 10) === rate.date && ['nbu', 'manual'].includes(rate.source);
}
export function parseRate(input: string): number {
  if (!/^\d{1,6}([.,]\d{1,6})?$/.test(input.trim())) throw new Error('invalidRate');
  const [whole, fraction = ''] = input.trim().replace(',', '.').split('.');
  const micros = Number(whole) * RATE_SCALE + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(micros) || micros <= 0 || micros > 1_000_000 * RATE_SCALE) throw new Error('invalidRate');
  return micros;
}
export const rateText = (rate?: ExchangeRate) => rate ? String(rate.micros / RATE_SCALE).replace('.', ',') : '';
const divideRounded = (numerator: bigint, denominator: bigint) => Number((numerator + denominator / 2n) / denominator);
/** Round the final payable amount once, with integer arithmetic (half up), to a whole euro/hryvnia. */
export function convertWhole(cents: number, from: Currency, to: Currency, rate?: ExchangeRate): number {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('invalidAmount');
  if (from === to) return wholeCents(cents);
  if (!validRate(rate)) throw new Error('rateRequired');
  const numerator = from === 'EUR' ? BigInt(cents) * BigInt(rate.micros) : BigInt(cents) * BigInt(RATE_SCALE);
  const denominator = 100n * BigInt(from === 'EUR' ? RATE_SCALE : rate.micros);
  const result = divideRounded(numerator, denominator) * 100;
  if (!Number.isSafeInteger(result)) throw new Error('invalidAmount');
  return result;
}
export function billAmount(inputCents: number, inputCurrency: Currency, currency: Currency, rate?: ExchangeRate): { feeCents: number; billing: Billing } {
  if (inputCents % 100) throw new Error('invalidAmount');
  const feeCents = convertWhole(inputCents, inputCurrency, 'EUR', rate);
  const amountCents = convertWhole(inputCents, inputCurrency, currency, rate);
  return { feeCents, billing: { currency, amountCents, ...(currency === 'UAH' && validRate(rate) ? { rate: { ...rate } } : {}) } };
}
export function bankFor(practice: PracticeProfile, currency: Currency): BankAccount {
  return currency === 'UAH'
    ? { holder: practice.accountHolderUa?.trim() || practice.name, iban: practice.ibanUa?.trim() || '', bank: practice.bankUa?.trim() || '', bic: practice.bicUa?.trim() || '' }
    : { holder: practice.accountHolder?.trim() || practice.name, iban: practice.iban.trim(), bank: practice.bank.trim(), bic: practice.bic?.trim() || '' };
}
export const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json';
export function parseNbu(value: unknown): ExchangeRate {
  if (!Array.isArray(value)) throw new Error('rateLoadFailed');
  const row = value.find(r => r && r.cc === 'EUR' && r.r030 === 978);
  if (!row || typeof row.rate !== 'number' || !Number.isFinite(row.rate) || typeof row.exchangedate !== 'string' || !/^\d{2}\.\d{2}\.\d{4}$/.test(row.exchangedate)) throw new Error('rateLoadFailed');
  const [day, month, year] = row.exchangedate.split('.');
  const rate: ExchangeRate = { micros: Math.round(row.rate * RATE_SCALE), date: `${year}-${month}-${day}`, source: 'nbu' };
  if (!validRate(rate) || new Date(`${rate.date}T00:00:00Z`).toISOString().slice(0, 10) !== rate.date) throw new Error('rateLoadFailed');
  return rate;
}
export async function fetchNbuRate(request: typeof fetch = fetch): Promise<ExchangeRate> {
  // No names, records, account numbers or identifiers are sent to the central bank.
  const response = await request(NBU_URL, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!response.ok) throw new Error('rateLoadFailed');
  return parseNbu(await response.json());
}
