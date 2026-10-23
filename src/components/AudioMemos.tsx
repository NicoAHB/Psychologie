import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Mic, Pause, Pencil, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { audioMime, MEMO_MAX_LABEL, MEMO_MAX_SUMMARY, memoTime, validateMemo, type MemoDraft, type MemoItem, type MemoMetadata, type MemoRecording } from '../lib/audioMemos';
import { MemoRecorder, memoRecordingSupported } from '../lib/memoRecorder';
import { registerBeforeLock, registerMemoMedia } from '../lib/autoLock';
import { uid } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';
import { editMemoMetadata, memoLabelChoices, memoLabelKey, visibleMemoLabelChoices } from '../lib/memoLabels';
import { deleteAudioMemo } from '../lib/records';

/** The only playback source is a transient in-memory blob URL, never an HTTP URL. */
export function MemoPlayer({ blob, durationMs }: { blob: Blob; durationMs: number }) {
  const { t } = useI18n(); const audio = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState(''), [playing, setPlaying] = useState(false), [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000), [speed, setSpeed] = useState('1'), [error, setError] = useState(false);
  useEffect(() => {
    const node = audio.current!, local = URL.createObjectURL(blob); let released = false;
    node.playbackRate = 1;
    setUrl(local); setPlaying(false); setPosition(0); setError(false); setDuration(durationMs / 1000); setSpeed('1');
    const release = () => {
      if (released) return; released = true;
      node.pause(); node.removeAttribute('src'); node.load(); URL.revokeObjectURL(local);
    };
    const unregister = registerMemoMedia(release);
    const hidden = () => { if (document.visibilityState === 'hidden') node.pause(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { unregister(); document.removeEventListener('visibilitychange', hidden); release(); };
  }, [blob, durationMs]);
  async function toggle() {
    const node = audio.current; if (!node) return;
    if (!node.paused) { node.pause(); return; }
    try { if (node.ended) node.currentTime = 0; await node.play(); setError(false); } catch { setError(true); }
  }
  return <div className="memo-player" role="group" aria-label={t('memoPlayer')}>
    <audio ref={audio} src={url || undefined} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { if (url) setError(true); }}
      onLoadedMetadata={() => { const d = audio.current?.duration; if (d && Number.isFinite(d)) setDuration(d); }} onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}/>
    <div className="memo-player-top"><button type="button" className="btn btn-secondary" disabled={!url} onClick={() => void toggle()} aria-label={t(playing ? 'memoPause' : 'memoPlay')}>{playing ? <Pause size={18}/> : <Play size={18}/>} {t(playing ? 'memoPause' : 'memoPlay')}</button>
      <span className="memo-timer" aria-label={t('memoElapsed')}>{memoTime(position * 1000)} / {memoTime(duration * 1000)}</span></div>
    <label className="field"><span>{t('memoSeek')}</span><input type="range" min="0" max={Math.max(.01, duration)} step="0.1" value={Math.min(position, duration)} aria-label={t('memoSeek')} aria-valuetext={`${memoTime(position * 1000)} / ${memoTime(duration * 1000)}`} onChange={e => { const next = Number(e.target.value); if (audio.current) audio.current.currentTime = next; setPosition(next); }}/></label>
    <Field label={t('memoPlaybackSpeed')}><select value={speed} onChange={e => { setSpeed(e.target.value); if (audio.current) audio.current.playbackRate = Number(e.target.value); }}><option value="1">{t('memoSpeedNormal')}</option><option value="1.5">{t('memoSpeedHalf')}</option><option value="2">{t('memoSpeedDouble')}</option></select></Field>
    {error && <Notice error>{t('memoPlaybackError')}</Notice>}
  </div>;
}
function MemoMetadataFields({ label, summary, setLabel, setSummary, vault }: { label: string; summary: string; setLabel: (value: string) => void; setSummary: (value: string) => void; vault: VaultController }) {
  const { t, language } = useI18n();
  const choices = useMemo(() => memoLabelChoices(vault.data?.settings.memoLabels, language, vault.data?.settings.memoLabelFavorites), [vault.data?.settings.memoLabels, vault.data?.settings.memoLabelFavorites, language]);
  const visible = useMemo(() => visibleMemoLabelChoices(choices, label), [choices, label]);
  const selected = visible.find(choice => memoLabelKey(choice.label) === memoLabelKey(label))?.id ?? '';
  return <><Field label={t('memoLabelPick')}><select value={selected} onChange={e => { const choice = choices.find(item => item.id === e.target.value); if (choice) setLabel(choice.label); }}>
      <option value="">{t('memoLabelChoose')}</option><optgroup label={t('memoLabelFavorite')}>{visible.filter(choice => choice.favorite).map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</optgroup><optgroup label={t('memoLabelStandard')}>{visible.filter(choice => choice.builtIn && !choice.favorite).map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</optgroup>
      {visible.some(choice => !choice.builtIn) && <optgroup label={t('memoLabelOwn')}>{visible.filter(choice => !choice.builtIn && !choice.favorite).map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</optgroup>}
    </select></Field><Field label={t('memoLabel')} hint={t('memoLabelRememberHint') + (choices.length > 58 ? ` ${t('memoLabelManyHint')}` : '')}><input value={label} maxLength={MEMO_MAX_LABEL} placeholder={t('memoLabelPlaceholder')} onChange={e => setLabel(e.target.value)}/></Field>
    <Field label={t('memoSummary')} hint={t('memoSummaryHint')}><textarea rows={4} maxLength={MEMO_MAX_SUMMARY} value={summary} placeholder={t('memoSummaryPlaceholder')} onChange={e => setSummary(e.target.value)}/></Field></>;
}
// These dialogs can be opened inside the existing session form. No nested form or implicit submit.
const preventImplicitSubmit = (e: KeyboardEvent) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'range') e.preventDefault(); };

function MemoRecorderDialog({ onSave, onClose, vault, checkpoint = false, onDiscardCheckpoint }: { checkpoint?: boolean; onDiscardCheckpoint?: (id: string) => Promise<void> | void; onSave: (draft: MemoDraft) => Promise<void> | void; onClose: () => void; vault: VaultController }) {
  const { t } = useI18n(); const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'stopping' | 'review' | 'error'>('idle');
  const [recording, setRecording] = useState<MemoRecording>(), [elapsed, setElapsed] = useState(0);
  const [label, setLabel] = useState(''), [summary, setSummary] = useState(''), [message, setMessage] = useState<TextKey>();
  const [saving, setSaving] = useState(false), recorder = useRef<MemoRecorder | undefined>(undefined), alive = useRef(true);
  const close = useRef(onClose); close.current = onClose;
  const memoId = useRef(uid()), checkpointQueue = useRef(Promise.resolve()), checkpointTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ onSave, recording, label, summary }); latest.current = { onSave, recording, label, summary };
  function checkpointNow(value = latest.current.recording) {
    clearTimeout(checkpointTimer.current);
    if (!checkpoint || !value) return checkpointQueue.current;
    const item = { ...value, id: memoId.current, label: latest.current.label.trim(), summary: latest.current.summary.trim() };
    setSaving(true);
    const pending = checkpointQueue.current.catch(() => {}).then(() => latest.current.onSave(item));
    checkpointQueue.current = pending.then(() => {});
    void pending.then(() => { if (alive.current) setSaving(false); }, () => { if (alive.current) { setSaving(false); setMessage('storageError'); } });
    return checkpointQueue.current;
  }
  useEffect(() => {
    if (!checkpoint || !recording) return;
    checkpointTimer.current = setTimeout(() => void checkpointNow().catch(() => {}), 700);
    return () => clearTimeout(checkpointTimer.current);
  }, [label, summary, recording, checkpoint]);
  useEffect(() => registerBeforeLock(async () => { await checkpointNow(); }), []);
  async function discard() {
    recorder.current?.dispose(); clearTimeout(checkpointTimer.current);
    try { await checkpointQueue.current; if (checkpoint && recording) await onDiscardCheckpoint?.(memoId.current); onClose(); } catch { setMessage('storageError'); }
  }

  useEffect(() => {
    alive.current = true;
    const terminate = () => { alive.current = false; recorder.current?.dispose(); close.current(); };
    const unregister = registerMemoMedia(terminate);
    const hide = () => { if (document.visibilityState === 'hidden') recorder.current?.stop(); };
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', terminate);
    return () => { alive.current = false; unregister(); recorder.current?.dispose(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', terminate); };
  }, []);
  function start() {
    memoId.current = uid();
    if (!alive.current) return;
    recorder.current?.dispose(); setRecording(undefined); setElapsed(0); setMessage(undefined);
    const next = new MemoRecorder({
      status: value => { if (alive.current) setPhase(value); }, tick: value => { if (alive.current) setElapsed(value); },
      recorded: value => { if (alive.current) { setRecording(value); setElapsed(value.durationMs); setPhase('review'); void checkpointNow(value).catch(() => {}); } },
      error: value => { if (alive.current) { setMessage(value); setPhase('error'); } }, limit: value => { if (alive.current) setMessage(value); },
    });
    recorder.current = next; void next.start();
  }
  async function save() {
    if (!recording) return; setSaving(true); setMessage(undefined);
    try {
      validateMemo(recording, { label, summary }); if (checkpoint) await checkpointNow(recording); else await onSave({ ...recording, id: memoId.current, label: label.trim(), summary: summary.trim() });
      if (alive.current) onClose();
    } catch { if (alive.current) setMessage('storageError'); } finally { if (alive.current) setSaving(false); }
  }
  return <Modal title={t('memoRecord')} onClose={() => { if (!saving) { recorder.current?.dispose(); void checkpointNow().then(onClose).catch(() => setMessage('storageError')); } }}>
    <div className="memo-recorder" onKeyDown={preventImplicitSubmit}>
      <p className="hint">{t('memoPrivacyHint')}</p><p className="hint">{t('memoLimits')}</p>
      <p role="status" aria-live="polite" aria-atomic="true">{t(phase === 'recording' ? 'memoRecording' : phase === 'requesting' ? 'memoRequesting' : phase === 'stopping' ? 'memoStopping' : phase === 'review' ? 'memoReview' : 'memoReady')}</p>
      <p className={`memo-record-time ${phase === 'recording' ? 'is-recording' : ''}`} aria-label={t('memoRecordingTime')} aria-live="off"><Mic aria-hidden="true" size={20}/><span>{memoTime(elapsed)}</span></p>
      {['idle', 'error'].includes(phase) && <button className="btn btn-primary" type="button" onClick={start} disabled={!memoRecordingSupported()}><Mic size={17}/>{t(phase === 'error' ? 'memoRetry' : 'memoStart')}</button>}
      {!memoRecordingSupported() && <Notice error>{t('memoUnsupported')}</Notice>}
      {phase === 'recording' && <button className="btn btn-secondary" type="button" onClick={() => recorder.current?.stop()}><Square size={17}/>{t('memoStop')}</button>}
      {recording && phase === 'review' && <><MemoMetadataFields label={label} summary={summary} setLabel={setLabel} setSummary={setSummary} vault={vault}/><MemoPlayer blob={recording.blob} durationMs={recording.durationMs}/></>}
      {message && <Notice error>{t(message)}</Notice>}
      <div className="form-actions memo-actions">
        <button className="btn btn-secondary" disabled={saving} type="button" onClick={() => void discard()}><Trash2 size={16}/>{t('memoDiscard')}</button>
        {phase === 'review' && <><button className="btn btn-secondary" type="button" disabled={saving} onClick={() => { void (async () => { await checkpointQueue.current; if (checkpoint && recording) await onDiscardCheckpoint?.(memoId.current); start(); })().catch(() => setMessage('storageError')); }}><RotateCcw size={16}/>{t('memoRepeat')}</button><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{t(saving ? 'working' : 'memoSave')}</button></>}
      </div>
    </div>
  </Modal>;
}

function MemoView({ item, vault, onEdit, onDelete, onClose }: { item: MemoItem; vault: VaultController; onEdit: (id: string, metadata: MemoMetadata) => Promise<void> | void; onDelete: (id: string) => Promise<void> | void; onClose: () => void }) {
  const { t } = useI18n(); const [blob, setBlob] = useState<Blob>(); const [error, setError] = useState<TextKey>();
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [label, setLabel] = useState(item.label), [summary, setSummary] = useState(item.summary);
  const close = useRef(onClose); close.current = onClose;
  const draftBlob = 'blob' in item ? item.blob : undefined, blobId = 'blobId' in item ? item.blobId : undefined;
  useEffect(() => {
    let active = true; setBlob(undefined); setError(undefined);
    const unregister = registerMemoMedia(() => { active = false; close.current(); });
    if (!audioMime(item.mimeType)) setError('memoUnsupported');
    else void (draftBlob ? Promise.resolve(draftBlob) : vault.file(blobId!, item.mimeType)).then(value => { if (active) setBlob(value); }).catch(() => { if (active) setError('memoPlaybackError'); });
    return () => { active = false; unregister(); };
  }, [blobId, draftBlob, item.mimeType, vault.file]);
  async function save() {
    setBusy(true); setError(undefined);
    try { validateMemo(item, { label, summary }); await onEdit(item.id, { label: label.trim(), summary: summary.trim() }); setEditing(false); }
    catch { setError('storageError'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(t('memoDeleteConfirm'))) return; setBusy(true); setError(undefined);
    try { await onDelete(item.id); onClose(); } catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={item.label || t('memoDefaultTitle')} onClose={() => { if (!busy) onClose(); }}>
    <div className="memo-view" onKeyDown={preventImplicitSubmit}>
      {editing ? <MemoMetadataFields label={label} summary={summary} setLabel={setLabel} setSummary={setSummary} vault={vault}/> : <section className="memo-summary"><h3>{t('memoSummary')}</h3><p className="pre-line">{item.summary || t('memoNoSummary')}</p></section>}
      {blob && !busy && <MemoPlayer blob={blob} durationMs={item.durationMs}/>}
      {!blob && !error && <p role="status">{t('memoLoading')}</p>}
      {error && <Notice error>{t(error)}</Notice>}
      <div className="form-actions memo-actions">{editing ? <><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { setEditing(false); setLabel(item.label); setSummary(item.summary); }}>{t('cancel')}</button><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void save()}>{t('save')}</button></>
        : <><button className="btn btn-danger" type="button" disabled={busy} onClick={() => void remove()}><Trash2 size={16}/>{t('memoDelete')}</button><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setEditing(true)}><Pencil size={16}/>{t('memoEdit')}</button></>}
      </div>
    </div>
  </Modal>;
}

export function SessionMemos({ items, vault, onAdd, onEdit, onDelete, disabled = false, focusId, onFocusHandled, checkpoint = false }: {
  items: readonly MemoItem[]; vault: VaultController; onAdd: (draft: MemoDraft) => Promise<void> | void;
  onEdit: (id: string, metadata: MemoMetadata) => Promise<void> | void; onDelete: (id: string) => Promise<void> | void;
  checkpoint?: boolean; disabled?: boolean; focusId?: string; onFocusHandled?: () => void;
}) {
  const { t, language } = useI18n(); const [recording, setRecording] = useState(false), [opened, setOpened] = useState<string>(); const [shown, setShown] = useState(10);
  const ordered = useMemo(() => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [items]);
  const focusHandled = useRef(onFocusHandled); focusHandled.current = onFocusHandled;
  useEffect(() => { if (focusId && items.some(m => m.id === focusId)) { setOpened(focusId); focusHandled.current?.(); } }, [focusId, items]);
  const selected = items.find(m => m.id === opened);
  const formatter = useMemo(() => new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' }), [language]);
  const date = (at: string) => Number.isFinite(Date.parse(at)) ? formatter.format(new Date(at)) : t('memoDefaultTitle');
  return <section className="session-memos" aria-label={t('memoSection')}>
    <div className="memo-section-head"><h4>{t('memoSection')}</h4><button type="button" className="btn btn-secondary btn-small" disabled={disabled} onClick={() => setRecording(true)}><Mic size={16}/>{t('memoRecord')}</button></div>
    {ordered.length > 0 && <ul className="memo-list">{ordered.slice(0, shown).map(item => <li key={item.id}><button type="button" className="memo-open" disabled={disabled} onClick={() => setOpened(item.id)}>
      <span className="memo-row-title"><Play size={16}/><strong>{item.label || t('memoDefaultTitle')}</strong><span className="memo-timer">{memoTime(item.durationMs)}</span></span>
      <time dateTime={item.createdAt}>{date(item.createdAt)}</time>{item.summary && <span className="memo-excerpt">{item.summary.slice(0, 180)}{item.summary.length > 180 ? '…' : ''}</span>}
    </button></li>)}</ul>}
    {ordered.length > shown && <button type="button" className="text-link" onClick={() => setShown(n => n + 10)}>{t('memoMore')}</button>}
    {recording && <MemoRecorderDialog checkpoint={checkpoint} onDiscardCheckpoint={onDelete} onSave={onAdd} onClose={() => setRecording(false)} vault={vault}/>}
    {selected && <MemoView item={selected} vault={vault} onEdit={onEdit} onDelete={onDelete} onClose={() => setOpened(undefined)}/>}
  </section>;
}

/** Only metadata is listed. Decryption and creation of a playback URL start on click. */
export function ClientMemoOverview({ vault, clientId }: { vault: VaultController; clientId: string }) {
  const { t, language } = useI18n(); const [shown, setShown] = useState(5), [opened, setOpened] = useState<string>();
  const memos = useMemo(() => vault.data!.audioMemos.filter(m => m.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)), [vault.data!.audioMemos, clientId]);
  const formatter = useMemo(() => new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' }), [language]);
  const selected = memos.find(memo => memo.id === opened);
  if (!memos.length) return null;
  return <section className="card memo-overview" aria-label={t('memoSection')}><div className="section-heading"><h2><Mic size={17}/>{t('memoSection')}</h2><p>{t('memoNewestFirst')}</p></div>
    <ul className="memo-list">{memos.slice(0, shown).map(memo => <li key={memo.id}><button type="button" className="memo-open" onClick={() => setOpened(memo.id)}>
      <span className="memo-row-title"><Play size={16}/><strong>{memo.label || t('memoDefaultTitle')}</strong><span className="memo-timer">{memoTime(memo.durationMs)}</span></span>
      <time dateTime={memo.createdAt}>{Number.isFinite(Date.parse(memo.createdAt)) ? formatter.format(new Date(memo.createdAt)) : t('memoDefaultTitle')}</time>
    </button></li>)}</ul>
    {memos.length > shown && <button type="button" className="text-link" onClick={() => setShown(n => n + 10)}>{t('memoMore')}</button>}
    {selected && <MemoView item={selected} vault={vault} onClose={() => setOpened(undefined)} onEdit={async (id, metadata) => { await vault.update(data => editMemoMetadata(data, id, metadata)); }} onDelete={async id => { await vault.remove(data => deleteAudioMemo(data, id)); }}/>}
  </section>;
}
