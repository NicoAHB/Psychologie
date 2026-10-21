import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isValidZone, reminderMessage } from '../shared/schedule-text.mjs';
const subtle = webcrypto.subtle;
const bytes = value => new Uint8Array(Buffer.from(value, 'base64'));
export async function decryptJob(privatePem, payload, id) {
  if (payload?.version !== 1) throw new Error('invalid_payload');
  const pem = privatePem.replaceAll('\\n', '\n').replace(/-----[^-]+-----|\s/g, '');
  const key = await subtle.importKey('pkcs8', bytes(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
  const contentKey = await subtle.unwrapKey('raw', bytes(payload.wrappedKey), key, { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv: bytes(payload.iv), additionalData: new TextEncoder().encode(`praxisraum-reminder:v1:${id}`) }, contentKey, bytes(payload.ciphertext));
  const value = JSON.parse(new TextDecoder().decode(plaintext));
  const chatsValid = [value.advisorChatId, value.clientChatId].every(chat => typeof chat === 'string' && (chat === '' || /^-?\d{1,24}$/.test(chat)));
  const legacy = value.startsAt === undefined; // jobs queued by an older app version carry only a bare clock time
  const valid = chatsValid && ['de', 'uk'].includes(value.language) && (legacy
    ? /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time)
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.startsAt) && !Number.isNaN(Date.parse(value.startsAt)) && isValidZone(value.advisorTimeZone) && isValidZone(value.clientTimeZone));
  if (!valid) throw new Error('invalid_payload');
  return value;
}
export function reminderText(recipient, payload) {
  if (payload.startsAt) return reminderMessage(recipient, payload);
  if (recipient === 'advisor') return `Erinnerung: Morgen um ${payload.time} steht ein Termin an.`;
  return payload.language === 'uk' ? `Нагадування про Вашу зустріч завтра о ${payload.time}` : `Erinnerung an Ihren Termin morgen um ${payload.time}`;
}
export async function processJobs({ env = process.env, request = fetch, now = () => new Date(), log = console.log } = {}) {
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN', 'REMINDER_PRIVATE_KEY', 'REMINDER_OWNER_ID'];
  if (names.some(name => !env[name])) throw new Error('missing_worker_configuration');
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  if (!/^https:\/\/[a-zA-Z0-9.-]+$/.test(base)) throw new Error('invalid_database_url');
  if (!/^[0-9a-f-]{36}$/i.test(env.REMINDER_OWNER_ID)) throw new Error('invalid_owner');
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  async function api(path, method, body) {
    const response = await request(`${base}/rest/v1/${path}`, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('database_request_failed');
    return response.status === 204 ? null : response.json();
  }
  async function patch(id, value) { await api(`reminder_jobs?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(env.REMINDER_OWNER_ID)}`, 'PATCH', value); }
  const jobs = await api('rpc/claim_reminder_jobs', 'POST', { p_owner: env.REMINDER_OWNER_ID, p_limit: 20 });
  const results = { claimed: jobs.length, sent: 0, failed: 0, expired: 0 };
  await Promise.all(jobs.map(async (job) => {
    try {
      // Defense in depth: a malformed response cannot cross account boundaries.
      if (job.user_id !== env.REMINDER_OWNER_ID) throw new Error('wrong_owner');
      if (new Date(job.due_at) > now()) throw new Error('not_due');
      if (new Date(job.expires_at) <= now()) { await patch(job.id, { status: 'failed', last_error: 'expired', lease_until: null }); results.expired++; return; }
      const payload = await decryptJob(env.REMINDER_PRIVATE_KEY, job.payload, job.id);
      for (const recipient of ['advisor', 'client']) {
        const chat = recipient === 'advisor' ? payload.advisorChatId : payload.clientChatId;
        if (!chat || job[`${recipient}_sent`]) continue;
        const response = await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ chat_id: chat, text: reminderText(recipient, payload), protect_content: true }),
        });
        if (!response.ok || !(await response.json()).ok) throw new Error('telegram_delivery_failed');
        await patch(job.id, { [`${recipient}_sent`]: true });
      }
      await patch(job.id, { status: 'sent', sent_at: now().toISOString(), lease_until: null, last_error: null }); results.sent++;
    } catch {
      // Never log response bodies, URLs with bot tokens, chat IDs, ciphertext or plaintext.
      results.failed++;
      await patch(job.id, { status: job.attempts >= 5 ? 'failed' : 'pending', lease_until: null, last_error: 'delivery_failed', next_attempt_at: new Date(now().getTime() + Math.min(60, 2 ** job.attempts) * 60000).toISOString() });
    }
  }));
  log(JSON.stringify(results));
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  processJobs().catch(() => { console.error('Reminder worker failed. Check configuration and service availability. No delivery details logged.'); process.exitCode = 1; });
}
