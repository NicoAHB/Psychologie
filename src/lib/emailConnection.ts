/** Public validation only. No credentials are persisted by this module. */
export type EmailProviderKind = 'resend' | 'gmail';
export const validGmailEndpoint = (value: unknown): value is string => typeof value === 'string'
  && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,160}\/exec$/.test(value);
export const validGmailAddress = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z0-9._%+-]+@(gmail\.com|googlemail\.com)$/i.test(value) && value.length <= 254;
export const validProviderCredential = (provider: EmailProviderKind, value: string) => provider === 'gmail'
  ? /^gmail_[0-9a-f]{64}$/.test(value) : /^re_[A-Za-z0-9_-]{10,200}$/.test(value);
export function newGmailConnectionKey(): string {
  return `gmail_${Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')}`;
}
