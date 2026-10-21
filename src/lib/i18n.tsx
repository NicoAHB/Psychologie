import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import de from '../locales/de.json';
import uk from '../locales/uk.json';
import type { Language } from './types';
export type TextKey = keyof typeof de;
const dictionaries: Record<Language, Record<TextKey, string>> = { de, uk };
const Context = createContext<{ language: Language; setLanguage: (lang: Language) => void; t: (key: TextKey) => string }>(null!);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem('praxisraum-language') === 'uk' ? 'uk' : 'de'; } catch { return 'de'; } });
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem('praxisraum-language', language); } catch { /* Optional preference storage. */ } }, [language]);
  return <Context.Provider value={{ language, setLanguage, t: key => dictionaries[language][key] }}>{children}</Context.Provider>;
}
export const useI18n = () => useContext(Context);
export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  return <div className="language-switch" role="group" aria-label={t('language')}>
    <button lang="de" aria-label="Deutsch" aria-pressed={language === 'de'} onClick={() => setLanguage('de')}>DE</button>
    <button lang="uk" aria-label="Українська" aria-pressed={language === 'uk'} onClick={() => setLanguage('uk')}>UA</button>
  </div>;
}
