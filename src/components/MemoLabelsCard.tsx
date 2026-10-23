import { useMemo, useState } from 'react';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { memoLabelChoices, memoLabelKey, removeMemoLabel, renameMemoLabel, type MemoLabelChoice } from '../lib/memoLabels';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

export function MemoLabelsCard({ vault }: { vault: VaultController }) {
  const { t, language } = useI18n(); const [query, setQuery] = useState(''), [limit, setLimit] = useState(20), [editing, setEditing] = useState<MemoLabelChoice>(), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const settings = vault.data!.settings;
  const choices = useMemo(() => memoLabelChoices(settings.memoLabels, language, settings.memoLabelFavorites), [settings.memoLabels, settings.memoLabelFavorites, language]);
  const matches = choices.filter(c => memoLabelKey(c.label).includes(memoLabelKey(query)));
  async function change(work: Parameters<VaultController['update']>[0]) { setBusy(true); setError(false); try { await vault.update(work); return true; } catch { setError(true); return false; } finally { setBusy(false); } }
  return <section className="card settings-card memo-labels-card"><h2>{t('memoLabelsManage')}</h2><p>{t('memoLabelsManageHint')}</p>
    <Field label={t('memoLabelsFind')}><input type="search" value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setLimit(20); }}/></Field>
    <ul className="vocabulary-list">{matches.slice(0, limit).map(choice => <li key={choice.id}><span>{choice.label}</span><div className="button-row">
      <button className="icon-btn" disabled={busy} aria-pressed={!!choice.favorite} aria-label={`${t(choice.favorite ? 'memoLabelUnfavorite' : 'memoLabelFavorite')}: ${choice.label}`} onClick={() => void change(d => { const favorites = new Set(d.settings.memoLabelFavorites ?? []); if (favorites.has(choice.id)) favorites.delete(choice.id); else favorites.add(choice.id); d.settings.memoLabelFavorites = [...favorites]; })}><Star size={18} fill={choice.favorite ? 'currentColor' : 'none'}/></button>
      {!choice.builtIn && <><button className="icon-btn" disabled={busy} aria-label={`${t('memoLabelRename')}: ${choice.label}`} onClick={() => { setName(choice.label); setEditing(choice); }}><Pencil size={18}/></button><button className="icon-btn danger" disabled={busy} aria-label={`${t('memoLabelRemove')}: ${choice.label}`} onClick={() => void change(d => removeMemoLabel(d, choice.label))}><Trash2 size={18}/></button></>}
    </div></li>)}</ul>{matches.length > limit && <button className="text-link" onClick={() => setLimit(n => n + 20)}>{t('followUpShowMore')}</button>}
    {error && <Notice error>{t('storageError')}</Notice>}
    {editing && <Modal title={t('memoLabelRename')} onClose={() => { if (!busy) setEditing(undefined); }}><form onSubmit={e => { e.preventDefault(); void change(d => renameMemoLabel(d, editing.label, name)).then(ok => { if (ok) setEditing(undefined); }); }}><p className="hint">{t('memoLabelsManageHint')}</p><Field label={t('memoLabelNewName')}><input autoFocus value={name} maxLength={120} required onChange={e => setName(e.target.value)}/></Field><div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(undefined)}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy || !name.trim()}>{t('save')}</button></div></form></Modal>}
  </section>;
}
