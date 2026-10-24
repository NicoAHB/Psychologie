/** Server-only provider credentials. Never return the result to a browser or log it. */
export interface ProviderEnvironment {
  SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string; EMAIL_FROM?: string;
}
export interface EmailProvider {
  provider: 'resend' | 'gmail'; endpoint: string;
  apiKey?: string; from?: string; senderEmail: string; senderName: string;
  enabled: boolean; editable: boolean; source: 'saved' | 'environment' | 'none'; updatedAt?: string;
}
class EmailSettingsUnavailable extends Error {
  constructor(readonly status: number) { super('emailSetupRequired'); }
}
export async function emailSettingsRpc(env: ProviderEnvironment, name: string, body: object, request: typeof fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('emailSetupRequired');
  const result = await request(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new EmailSettingsUnavailable(result.status);
  return result.status === 204 ? null : result.json();
}
export async function loadEmailProvider(env: ProviderEnvironment, owner: string, request: typeof fetch): Promise<EmailProvider> {
  let editable = false;
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const saved = await emailSettingsRpc(env, 'get_email_provider_settings', { p_owner: owner }, request);
      editable = true;
      if (saved) {
        if (typeof saved.apiKey !== 'string' || !saved.apiKey || typeof saved.senderEmail !== 'string' || typeof saved.senderName !== 'string' || typeof saved.enabled !== 'boolean') throw new Error('invalid');
        const provider = saved.provider ?? 'resend', endpoint = saved.endpoint ?? '';
        if (!['resend', 'gmail'].includes(provider) || typeof endpoint !== 'string'
          || provider === 'gmail' && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,160}\/exec$/.test(endpoint)) throw new Error('invalid');
        return { provider, endpoint, apiKey: saved.enabled ? saved.apiKey : undefined,
          from: saved.enabled ? (saved.senderName ? `${saved.senderName} <${saved.senderEmail}>` : saved.senderEmail) : undefined,
          senderEmail: saved.senderEmail, senderName: saved.senderName, enabled: saved.enabled, editable,
          source: 'saved', updatedAt: saved.updatedAt };
      }
    } catch (error) {
      // If the new store cannot be read, fail closed instead of switching sender/key.
      // Legacy installations without a service-role secret keep their previous behavior.
      const missing = error instanceof EmailSettingsUnavailable && error.status === 404;
      if (!(missing && env.RESEND_API_KEY && env.EMAIL_FROM)) throw new Error(missing ? 'emailSetupRequired' : 'emailConnectionError');
    }
  }
  const legacy = env.EMAIL_FROM?.match(/^(.*?)\s*<([^<>]+)>$/);
  return { provider: 'resend', endpoint: '', apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM,
    senderEmail: legacy?.[2] ?? env.EMAIL_FROM ?? '', senderName: legacy?.[1]?.trim() ?? '',
    enabled: !!(env.RESEND_API_KEY && env.EMAIL_FROM), editable, source: env.RESEND_API_KEY && env.EMAIL_FROM ? 'environment' : 'none' };
}
export function publicEmailStatus(provider: EmailProvider, accountEmail: string) {
  return { ready: !!(provider.apiKey && provider.from), senderEmail: provider.senderEmail,
    provider: provider.provider, endpoint: provider.endpoint,
    senderName: provider.senderName, enabled: provider.enabled, editable: provider.editable,
    keyStored: provider.source !== 'none', source: provider.source, updatedAt: provider.updatedAt, accountEmail };
}
/** Fixed public codes only; never forward a provider's message, which may include addresses. */
export async function emailProviderError(response: Response) {
  if (response.status === 429) return 'emailRateLimited';
  if (response.status === 401) return 'emailProviderKeyInvalid';
  let name = ''; try { const body = await response.json(); name = body.name;
    if (['emailGmailConnectionInvalid', 'emailGmailAddressMismatch', 'emailGmailDeliveryUnknown'].includes(body.error)) return body.error as string;
  } catch { /* Generic provider error. */ }
  if (response.status === 403 || response.status === 422) {
    if (name === 'validation_error' || name === 'restricted_api_key' || name === 'invalid_access') return 'emailSenderNotVerified';
  }
  return 'emailSendError';
}
