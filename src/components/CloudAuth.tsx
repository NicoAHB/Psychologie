import { useEffect, useState, type FormEvent } from 'react';
import { Cloud, LogIn, LogOut, LoaderCircle } from 'lucide-react';
import { cloud, cloudError } from '../lib/cloud';
import { useI18n, type TextKey } from '../lib/i18n';
import { Field, Notice } from './ui';
export function useCloudUser() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!cloud) return;
    cloud.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = cloud.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return userId;
}
export function CloudAuth({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n(); const user = useCloudUser();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<TextKey>(); const [error, setError] = useState(false);
  async function submit(e: FormEvent, signUp = false) {
    e.preventDefault(); if (!cloud) return;
    if (!email.includes('@') || password.length < 8) { setMessage('required'); setError(true); return; }
    setBusy(true); setMessage(undefined);
    try {
      const result = signUp ? await cloud.auth.signUp({ email, password }) : await cloud.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setError(false); setPassword(''); if (signUp) setMessage('signUpHint');
    } catch (err) { setError(true); setMessage(cloudError(err) as TextKey); } finally { setBusy(false); }
  }
  if (!cloud) return <Notice>{t('cloudSetup')}</Notice>;
  return <div className="cloud-auth">{user ? <><div className="connected-row"><span><Cloud size={18}/>{t('signedIn')}</span><button className="btn btn-ghost" onClick={async () => { const { error: err } = await cloud!.auth.signOut(); if (err) { setError(true); setMessage('syncError'); } }}><LogOut size={16}/>{t('signOut')}</button></div>{children}</> : <form onSubmit={submit} noValidate>
    <Field label={t('email')}><input type="email" value={email} autoComplete="username" placeholder={t('emailPlaceholder')} onChange={e => setEmail(e.target.value)}/></Field>
    <Field label={t('cloudPassword')}><input type="password" minLength={8} value={password} autoComplete="current-password" onChange={e => setPassword(e.target.value)}/></Field>
    <div className="button-row"><button className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <LogIn size={17}/>} {t('signIn')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={e => void submit(e, true)}>{t('signUp')}</button></div>
  </form>}{message && <Notice error={error}>{t(message)}</Notice>}</div>;
}
