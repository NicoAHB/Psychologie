import type { Client, ClientPostalAddress } from './types';

export const emptyPostalAddress = (country = ''): ClientPostalAddress => ({ street: '', additional: '', postalCode: '', city: '', region: '', country });
const countryKey = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('uk').replace(/[.\s_-]/g, '');
export const isUkrainianAddress = (country: string) => ['ua', 'ukr', 'ukraine', 'ukraina', 'україна', 'украина'].includes(countryKey(country));
export const isGermanAddress = (country: string) => ['de', 'deu', 'deutschland', 'germany', 'німеччина', 'германия'].includes(countryKey(country));

export function cleanPostalAddress(value: ClientPostalAddress): ClientPostalAddress {
  const result = emptyPostalAddress();
  for (const field of Object.keys(result) as (keyof ClientPostalAddress)[]) {
    if (typeof value[field] !== 'string') throw new Error('invalidBackup');
    result[field] = value[field].trim();
  }
  return result;
}

/** One postal snapshot is the source of truth; the legacy printable string is
 * derived again after restoring or merging, never merged independently. */
export function formatPostalAddress(value: ClientPostalAddress): string {
  const a = cleanPostalAddress(value);
  if (![a.street, a.additional, a.postalCode, a.city, a.region].some(Boolean)) return '';
  const locality = isUkrainianAddress(a.country)
    ? [a.city, a.region, a.postalCode]
    : [[a.postalCode, a.city].filter(Boolean).join(' '), a.region];
  return [a.street, a.additional, ...locality, a.country].filter(Boolean).join('\n');
}

/** Only split recognisable old addresses. Unassigned lines remain editable in
 * the additional-address field; unrelated profile edits preserve the original. */
export function editablePostalAddress(client?: Pick<Client, 'address' | 'postalAddress'>): { value: ClientPostalAddress; legacy: boolean } {
  if (client?.postalAddress) return { value: cleanPostalAddress(client.postalAddress), legacy: false };
  const text = client?.address?.trim() ?? '', lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const value = emptyPostalAddress();
  if (!text) return { value, legacy: false };
  if ((lines.length === 2 || lines.length === 3) && /^\d{5}\s+\S/.test(lines[1])) {
    const [, postalCode, city] = /^(\d{5})\s+(.+)$/.exec(lines[1])!;
    Object.assign(value, { street: lines[0], postalCode, city, country: lines[2] ?? '' });
    return { value, legacy: false };
  }
  const postalIndex = lines.findIndex((line, index) => index >= 2 && /^\d{5}$/.test(line));
  if (postalIndex >= 2 && postalIndex === lines.length - 2 && isUkrainianAddress(lines.at(-1)!)) {
    Object.assign(value, { street: lines[0], city: lines[1], region: lines.slice(2, postalIndex).join('\n'), postalCode: lines[postalIndex], country: lines.at(-1)! });
    return { value, legacy: false };
  }
  value.additional = text;
  return { value, legacy: true };
}

export function validPostalCode(address: ClientPostalAddress): boolean {
  const code = address.postalCode.trim();
  return !code || !(isGermanAddress(address.country) || isUkrainianAddress(address.country)) || /^\d{5}$/.test(code);
}

export function normalizeClientAddress(client: Client, observedSnapshot?: unknown): Client {
  if (!client.postalAddress) return { ...client };
  const printed = formatPostalAddress(client.postalAddress);
  const observed = observedSnapshot && typeof observedSnapshot === 'object' ? observedSnapshot as Record<string, unknown> : undefined;
  // Older apps can echo the new snapshot unchanged while editing only their
  // familiar text field. Adopt that observed edit before the normal CRDT
  // migration; never overwrite a newly changed structured snapshot with text.
  if (typeof client.address === 'string' && client.address !== printed && observed &&
    (Object.keys(emptyPostalAddress()) as (keyof ClientPostalAddress)[]).every(key => observed[key] === client.postalAddress![key])) {
    const postalAddress = editablePostalAddress({ address: client.address }).value;
    return { ...client, postalAddress, address: formatPostalAddress(postalAddress) };
  }
  return { ...client, address: printed };
}
