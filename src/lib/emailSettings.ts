import { getCloud } from './cloud';
import type { TextKey } from './i18n';
import type { EmailProviderKind } from './emailConnection';
export interface EmailStatus {
  provider: EmailProviderKind; endpoint: string;
  ready: boolean; enabled: boolean; editable: boolean; keyStored: boolean;
  senderEmail: string; senderName: string; accountEmail: string;
  source: 'saved' | 'environment' | 'none'; updatedAt?: string;
}
export const emailSetupErrors = ['emailSetupRequired', 'emailSettingsInvalid', 'emailNotConfigured',
  'emailProviderKeyInvalid', 'emailSenderNotVerified', 'emailTestAccountMissing', 'emailRateLimited',
  'emailSendError', 'authError', 'emailConnectionError', 'emailGmailConnectionInvalid', 'emailGmailAddressMismatch', 'emailGmailDeliveryUnknown'] as const;
export const emailErrorKey = (error: unknown): TextKey => error instanceof Error && (emailSetupErrors as readonly string[]).includes(error.message) ? error.message as TextKey : 'emailConnectionError';
async function invoke(body: object, signal?: AbortSignal) {
  const cloud = await getCloud(); if (!cloud) throw new Error('emailSetupRequired');
  const { data: auth, error: authError } = await cloud.auth.getUser();
  if (authError || !auth.user) throw new Error('authError');
  const { data, error } = await cloud.functions.invoke('send-client-email', { body, signal });
  if (error) {
    let code = ''; try { code = (await error.context?.json())?.error; } catch { /* Network/CORS or undeployed function. */ }
    throw new Error((emailSetupErrors as readonly string[]).includes(code) ? code : 'emailConnectionError');
  }
  return data;
}
export function readEmailStatus(value: unknown): EmailStatus {
  const data = value as Partial<EmailStatus> | null;
  if (!data || ['ready', 'enabled', 'editable', 'keyStored'].some(k => typeof data[k as keyof EmailStatus] !== 'boolean')
    || ['senderEmail', 'senderName', 'accountEmail'].some(k => typeof data[k as keyof EmailStatus] !== 'string')
    || !['saved', 'environment', 'none'].includes(data.source ?? '')
    || !['resend','gmail'].includes(data.provider ?? 'resend') || data.endpoint !== undefined && typeof data.endpoint !== 'string') throw new Error('emailConnectionError');
  // An explicit projection also drops accidental private fields in server responses.
  return { provider: data.provider ?? 'resend', endpoint: data.endpoint ?? '', ready: data.ready!, enabled: data.enabled!, editable: data.editable!, keyStored: data.keyStored!,
    senderEmail: data.senderEmail!, senderName: data.senderName!, accountEmail: data.accountEmail!, source: data.source!,
    ...(typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt)) && { updatedAt: data.updatedAt }) };
}
export async function getEmailStatus(signal?: AbortSignal) { return readEmailStatus(await invoke({ action: 'status' }, signal)); }
export async function saveEmailSettings(input: { senderEmail: string; senderName: string; apiKey: string; enabled: boolean; provider?: EmailProviderKind; endpoint?: string }, signal?: AbortSignal) {
  return readEmailStatus(await invoke({ action: 'save', ...input }, signal));
}
export async function sendEmailTest(language: 'de' | 'uk', requestId: string, signal?: AbortSignal) {
  const result = await invoke({ action: 'test', language, requestId }, signal);
  if (!result || typeof result.providerId !== 'string' || !result.providerId || typeof result.acceptedAt !== 'string' || !Number.isFinite(Date.parse(result.acceptedAt))) throw new Error('emailSendError');
  return result.acceptedAt as string;
}
