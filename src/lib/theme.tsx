import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useI18n } from './i18n';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, appearanceVariables, normalizeAppearance, parseAppearance, type AppearancePreferences } from './appearance';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'praxisraum-theme';
const preferenceOf = (value?: string | null): ThemePreference => value === 'light' || value === 'dark' ? value : 'system';
const Context = createContext<{
  preference: ThemePreference; dark: boolean; setPreference: (value: ThemePreference) => void;
  appearance: AppearancePreferences; setAppearance: (value: AppearancePreferences) => void;
}>(null!);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => preferenceOf(document.documentElement.dataset.themePreference));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [appearance, updateAppearance] = useState<AppearancePreferences>(() => {
    try { return parseAppearance(localStorage.getItem(APPEARANCE_KEY)); } catch { return { ...DEFAULT_APPEARANCE }; }
  });
  const dark = preference === 'dark' || preference === 'system' && systemDark;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change); change();
    const storage = (event: StorageEvent) => {
      if (event.key === KEY || event.key === null) setPreference(preferenceOf(event.newValue));
      if (event.key === APPEARANCE_KEY || event.key === null) updateAppearance(parseAppearance(event.newValue));
    };
    window.addEventListener('storage', storage);
    return () => { media.removeEventListener('change', change); window.removeEventListener('storage', storage); };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePreference = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1628' : '#467269');
    try { localStorage.setItem(KEY, preference); } catch { /* Optional device preference, independent of the encrypted vault. */ }
  }, [dark, preference]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(appearanceVariables(appearance))) root.style.setProperty(name, value);
    root.dataset.backgroundPalette = appearance.palette;
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* Live controls also work without storage. */ }
  }, [appearance]);
  return <Context.Provider value={{ preference, dark, setPreference, appearance, setAppearance: value => updateAppearance(normalizeAppearance(value)) }}>
    <div className="app-aurora" aria-hidden="true"/>{children}
  </Context.Provider>;
}
export const useTheme = () => useContext(Context);
export function ThemeToggle() {
  const { dark, setPreference } = useTheme(); const { t } = useI18n();
  const label = t(dark ? 'themeUseLight' : 'themeUseDark');
  return <button className="icon-btn theme-toggle" type="button" aria-label={label} title={label} onClick={() => setPreference(dark ? 'light' : 'dark')}>
    {dark ? <Sun size={20}/> : <Moon size={20}/>}
  </button>;
}
