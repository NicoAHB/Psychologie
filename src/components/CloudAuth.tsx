import { useEffect, useState, type FormEvent } from 'react';
import { Cloud, LogIn, LogOut, LoaderCircle } from 'lucide-react';
import { cloudConfigured, cloudError, getCloud } from '../lib/cloud';
import { useI18n, type TextKey } from '../lib/i18n';
import { Field, Notice } from './ui';
export function useCloudUser(enabled = true) {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !cloudConfigured) return;
    let active = true; let unsubscribe = () => {};
    getCloud().then(cloud => {
      if (!cloud || !active) return;
      void cloud.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id ?? null); });
      const { data } = cloud.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [enabled]);
  return userId;
}
export function CloudAuth({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n(); const user = useCloudUser();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<TextKey>(); const [error, setError] = useState(false);
  async function submit(e: FormEvent, signUp = false) {
    e.preventDefault();
    if (!email.includes('@') || password.length < 8) { setMessage('required'); setError(true); return; }
    setBusy(true); setMessage(undefined);
    try {
      const cloud = await getCloud(); if (!cloud) throw new Error('cloudMissing');
      const result = signUp ? await cloud.auth.signUp({ email, password }) : await cloud.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setError(false); setPassword(''); if (signUp) setMessage('signUpHint');
    } catch (err) { setError(true); setMessage(cloudError(err) as TextKey); } finally { setBusy(false); }
  }
  if (!cloudConfigured) return <Notice>{t('cloudSetup')}</Notice>;
  return <div className="cloud-auth">{user ? <><div className="connected-row"><span><Cloud size={18}/>{t('signedIn')}</span><button className="btn btn-ghost" onClick={async () => { try { const { error: err } = await (await getCloud())!.auth.signOut(); if (err) throw err; } catch { setError(true); setMessage('syncError'); } }}><LogOut size={16}/>{t('signOut')}</button></div>{children}</> : <form onSubmit={submit} noValidate>
    <Field label={t('email')}><input type="email" value={email} autoComplete="username" placeholder={t('emailPlaceholder')} onChange={e => setEmail(e.target.value)}/></Field>
    <Field label={t('cloudPassword')}><input type="password" minLength={8} value={password} autoComplete="current-password" onChange={e => setPassword(e.target.value)}/></Field>
    <div className="button-row"><button className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <LogIn size={17}/>} {t('signIn')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={e => void submit(e, true)}>{t('signUp')}</button></div>
  </form>}{message && <Notice error={error}>{t(message)}</Notice>}</div>;
}
