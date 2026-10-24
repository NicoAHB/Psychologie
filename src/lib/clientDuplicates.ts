import type { Client } from './types';

export type DuplicateReason = 'email' | 'phone' | 'name' | 'similarName' | 'birthday';
export interface DuplicateInput { name: string; email: string; contact: string; birthday?: string }
const clean = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('uk').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const nameKey = (value: string) => clean(value).split(' ').sort().join(' ');
function phones(value: string): string[] {
  return [...value.matchAll(/(?:\+|00)?\d[\d\s()./-]{5,}\d/g)].filter(m => !/^\d{4}-\d{2}-\d{2}$|^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(m[0].trim())).map(m => m[0].replace(/\D/g, '').replace(/^00/, '')).filter(number => number.length >= 7 && number.length <= 15);
}
export function clientDuplicateIndex(clients: readonly Client[]) {
  return clients.map(client => ({ client, name: nameKey(client.name), email: client.email?.trim().toLocaleLowerCase() ?? '', phones: phones(client.contact) }));
}
/** One missing, added or changed letter. No language model or external lookup. */
function oneEdit(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}
export function possibleClientDuplicates(index: ReturnType<typeof clientDuplicateIndex>, input: DuplicateInput, limit = 5) {
  const name = nameKey(input.name), email = input.email.trim().toLocaleLowerCase(), numbers = phones(input.contact);
  return index.flatMap(row => {
    const reasons: DuplicateReason[] = [];
    if (email && email === row.email) reasons.push('email');
    if (numbers.some(number => row.phones.includes(number))) reasons.push('phone');
    if (name.length >= 3 && row.name === name) reasons.push('name');
    else if (name.includes(' ') && row.name.includes(' ') && oneEdit(name, row.name)) reasons.push('similarName');
    // Birthday supports a name match, rather than identifying unrelated people by a date alone.
    if (reasons.some(r => r === 'name' || r === 'similarName') && input.birthday && row.client.birthday === input.birthday) reasons.push('birthday');
    return reasons.length ? [{ client: row.client, reasons, score: (reasons.includes('email') ? 8 : 0) + (reasons.includes('phone') ? 8 : 0) + (reasons.includes('name') ? 4 : 1) + (reasons.includes('birthday') ? 4 : 0) }] : [];
  }).sort((a, b) => b.score - a.score || a.client.name.localeCompare(b.client.name)).slice(0, limit);
}
