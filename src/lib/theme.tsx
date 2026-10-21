import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useI18n } from './i18n';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'praxisraum-theme';
const preferenceOf = (value?: string | null): ThemePreference => value === 'light' || value === 'dark' ? value : 'system';
const Context = createContext<{ preference: ThemePreference; dark: boolean; setPreference: (value: ThemePreference) => void }>(null!);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => preferenceOf(document.documentElement.dataset.themePreference));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const dark = preference === 'dark' || preference === 'system' && systemDark;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change); change();
    const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) setPreference(preferenceOf(event.newValue)); };
    window.addEventListener('storage', storage);
    return () => { media.removeEventListener('change', change); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePreference = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1628' : '#467269');
    try { localStorage.setItem(KEY, preference); } catch { /* Optional device preference, independent of the encrypted vault. */ }
  }, [dark, preference]);
  return <Context.Provider value={{ preference, dark, setPreference }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
export function ThemeToggle() {
  const { dark, setPreference } = useTheme(); const { t } = useI18n();
  const label = t(dark ? 'themeUseLight' : 'themeUseDark');
  return <button className="icon-btn theme-toggle" type="button" aria-label={label} title={label} onClick={() => setPreference(dark ? 'light' : 'dark')}>
    {dark ? <Sun size={20}/> : <Moon size={20}/>}
  </button>;
}
