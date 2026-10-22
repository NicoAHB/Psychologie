import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { dateLabel } from '../lib/dates';
import { searchVault, type Hit } from '../lib/search';
import type { VaultController } from '../lib/useVault';
import { Modal } from './ui';

const marked = (hit: Hit): ReactNode[] => {
  const parts: ReactNode[] = []; let at = 0;
  for (const [from, to] of hit.marks) { if (from < at) continue; parts.push(hit.text.slice(at, from), <mark key={from}>{hit.text.slice(from, to)}</mark>); at = to; }
  parts.push(hit.text.slice(at)); return parts;
};
/** Search across everything in the open vault; nothing leaves the device. */
export function SearchModal({ vault, onOpen, onClose }: { vault: VaultController; onOpen: (hit: Hit) => void; onClose: () => void }) {
  const { t, language } = useI18n(); const [query, setQuery] = useState(''); const input = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const hits = useMemo(() => searchVault(vault.data!, deferredQuery), [vault.data, deferredQuery]);
  useEffect(() => { input.current?.focus(); }, []);
  return <Modal title={t('searchEverything')} onClose={onClose} wide>
    <label className="search-field big"><Search size={19}/><input ref={input} aria-label={t('searchEverything')} placeholder={t('searchPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && hits[0]) onOpen(hits[0]); }}/></label>
    <p className="hint">{t('searchHint')}</p>
    <ul className="search-results" aria-live="polite">{hits.map(hit => <li key={`${hit.kind}${hit.id}`}><button onClick={() => onOpen(hit)}>
      <span className="hit-head"><strong>{hit.title}</strong><span className="tag-chip">{t(`hit${hit.kind[0].toUpperCase()}${hit.kind.slice(1)}` as TextKey)}</span>{hit.date && <time>{dateLabel(hit.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</time>}</span>
      <span className="hit-text">{marked(hit)}</span></button></li>)}</ul>
    {query.trim() && !hits.length && <p className="hint">{t('searchEmpty')}</p>}
  </Modal>;
}
