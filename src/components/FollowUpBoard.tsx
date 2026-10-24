import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarClock, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { dateLabel } from '../lib/dates';
import { practiceToday } from '../lib/followUp';
import { deleteFollowUp, finishFollowUp, followUpRows, matchesFollowUp, saveFollowUp, type FollowUpFilter, type FollowUpRow } from '../lib/followUpTasks';
import { uid } from '../lib/types';
import { useI18n, type TextKey } from '../lib/i18n';
import type { VaultController } from '../lib/useVault';
import { FollowUpFields } from './FollowUpFields';
import { Field, Modal, Notice } from './ui';

function FollowUpEditor({ vault, task, clientId, onClose }: { vault: VaultController; task?: FollowUpRow; clientId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const [owner, setOwner] = useState(task?.clientId ?? clientId ?? vault.data!.clients[0]?.id ?? '');
  const [date, setDate] = useState(task?.dueOn ?? practiceToday(vault.data!.settings));
  const [note, setNote] = useState(task?.note ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState<TextKey>();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(undefined);
    try {
      const row: FollowUpRow = { ...task, id: task?.id ?? uid(), clientId: owner, dueOn: date, note, createdAt: task?.createdAt ?? new Date().toISOString() };
      await vault.update(d => saveFollowUp(d, row)); onClose();
    } catch (e) { setError(e instanceof Error && e.message === 'followUpTaskRequired' ? 'followUpTaskRequired' : 'storageError'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!task || !window.confirm(t('followUpDeleteConfirm'))) return;
    setBusy(true); try { await vault.remove(d => deleteFollowUp(d, task)); onClose(); } catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t(task ? 'followUpEdit' : 'followUpAdd')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={e => void submit(e)} noValidate>
    {!task && !clientId && <Field label={t('client')}><select value={owner} disabled={busy} onChange={e => setOwner(e.target.value)}>{vault.data!.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
    <FollowUpFields date={date} note={note} disabled={busy} onDate={setDate} onNote={setNote}/>
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions">{task && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16}/>{t('delete')}</button>}<button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t(busy ? 'saving' : 'save')}</button></div>
  </form></Modal>;
}

export function FollowUpBoard({ vault, clientId, onOpen, framed = true }: {
  vault: VaultController; clientId?: string; onOpen?: (clientId: string) => void; framed?: boolean;
}) {
  const { t, language } = useI18n(), data = vault.data!, day = practiceToday(data.settings);
  const [filter, setFilter] = useState<FollowUpFilter>('all'), [limit, setLimit] = useState(6);
  const [editor, setEditor] = useState<FollowUpRow | 'new'>(), [busy, setBusy] = useState<string>(), [error, setError] = useState(false);
  const all = useMemo(() => followUpRows(data).filter(row => !clientId || row.clientId === clientId), [data, clientId]);
  const rows = useMemo(() => all.filter(row => matchesFollowUp(row, filter, day)), [all, filter, day]);
  const clients = useMemo(() => new Map(data.clients.map(c => [c.id, c])), [data.clients]);
  async function finish(row: FollowUpRow) {
    if (busy) return; setBusy(row.id); setError(false);
    try { await vault.update(d => finishFollowUp(d, row)); } catch { setError(true); } finally { setBusy(undefined); }
  }
  return <section className={`${framed ? 'card ' : ''}follow-up-tasks`} aria-label={t('followUpTasksTitle')}>
    <div className="section-heading flex-wrap"><div><h3><CalendarClock size={18} aria-hidden="true"/>{t('followUpTasksTitle')}</h3><p>{t('followUpTasksHint')}</p></div><button className="btn btn-secondary" disabled={!data.clients.length} onClick={() => setEditor('new')}><Plus size={16}/>{t('followUpAdd')}</button></div>
    <Field label={t('followUpFilter')}><select value={filter} onChange={e => { setFilter(e.target.value as FollowUpFilter); setLimit(6); }}>{(['all', 'overdue', 'today', 'week', 'later'] as const).map(value => <option key={value} value={value}>{t(`followUpFilter_${value}`)}</option>)}</select></Field>
    {!rows.length ? <p className="hint">{t('followUpNoTasks')}</p> : <ul className="work-list follow-up-task-list">{rows.slice(0, limit).map(row => <li key={row.id}>
      <div>{!clientId && <strong>{clients.get(row.clientId)?.name}</strong>}<p className="pre-line">{row.note || t('workFollowUp')}</p><span className={`follow-up-due ${row.dueOn < day ? 'is-overdue' : ''}`}>{t(row.dueOn < day ? 'followUpFilter_overdue' : row.dueOn === day ? 'followUpFilter_today' : 'followUpScheduled')} · <time dateTime={row.dueOn}>{dateLabel(row.dueOn, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</time></span></div>
      <div className="button-row">{!clientId && onOpen && <button className="btn btn-secondary btn-small" aria-label={`${t('workOpen')}: ${clients.get(row.clientId)?.name}`} onClick={() => onOpen(row.clientId)}><ArrowRight size={16}/>{t('workOpen')}</button>}
        <button className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => setEditor(row)}><Pencil size={15}/>{t('followUpReschedule')}</button>
        <button className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => void finish(row)}><Check size={15}/>{t('clientFollowUpDone')}</button></div>
    </li>)}</ul>}
    {rows.length > limit && <button className="text-link" onClick={() => setLimit(n => n + 10)}>{t('followUpShowMore')}</button>}
    {error && <Notice error>{t('storageError')}</Notice>}
    {editor && <FollowUpEditor vault={vault} clientId={clientId} task={editor === 'new' ? undefined : editor} onClose={() => setEditor(undefined)}/>}
  </section>;
}
