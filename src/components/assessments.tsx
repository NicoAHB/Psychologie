import { useState, type FormEvent } from 'react';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { dateLabel, today } from '../lib/dates';
import { changeSincePrevious, history, INSTRUMENTS, isComplete, needsAttention, scoreOf, severityOf } from '../lib/assessments';
import { uid, type Assessment, type AssessmentKind } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

const KINDS: AssessmentKind[] = ['phq9', 'gad7'];
const itemKey = (kind: AssessmentKind, index: number) => `${kind}_${index + 1}` as TextKey;
const severityKey = (kind: AssessmentKind, total: number) => `sev_${severityOf(kind, total)}` as TextKey;

export function AssessmentForm({ vault, clientId, onClose }: { vault: VaultController; clientId: string; onClose: () => void }) {
  const { t } = useI18n(); const [kind, setKind] = useState<AssessmentKind>('phq9'); const [date, setDate] = useState(today());
  const [answers, setAnswers] = useState<(number | null)[]>(Array(9).fill(null)); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  const instrument = INSTRUMENTS[kind]; const complete = isComplete(kind, answers);
  const total = complete ? scoreOf(kind, answers) : answers.reduce<number>((sum, a) => sum + (a ?? 0), 0);
  function choose(next: AssessmentKind) { setKind(next); setAnswers(Array(INSTRUMENTS[next].items).fill(null)); }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!complete || !date) { setError('fillAllItems'); return; }
    setBusy(true);
    try { await vault.update(d => { d.assessments.push({ id: uid(), clientId, kind, date, answers: answers as number[], note: note.trim() }); }); onClose(); }
    catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t('addQuestionnaire')} onClose={() => { if (!busy) onClose(); }} wide><form onSubmit={submit} noValidate>
    <div className="form-grid"><Field label={t('questionnaires')}><select value={kind} onChange={e => choose(e.target.value as AssessmentKind)}>{KINDS.map(k => <option key={k} value={k}>{t(`${k}Title` as TextKey)}</option>)}</select></Field>
      <Field label={t('date')}><input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)}/></Field></div>
    <p className="hint">{t('phqIntro')}</p>
    <ol className="question-list">{Array.from({ length: instrument.items }, (_, i) => <li key={`${kind}${i}`}><fieldset><legend>{t(itemKey(kind, i))}</legend>
      <div className="answer-row" role="radiogroup" aria-label={t(itemKey(kind, i))}>{[0, 1, 2, 3].map(value => <label key={value} className={`answer ${answers[i] === value ? 'chosen' : ''}`}><input type="radio" name={`${kind}-${i}`} checked={answers[i] === value} onChange={() => setAnswers(answers.map((a, j) => j === i ? value : a))}/><span>{t(`answer${value}` as TextKey)}</span></label>)}</div></fieldset></li>)}</ol>
    <div className="score-line" aria-live="polite"><span>{t('scoreLabel')}</span><strong>{total} / {instrument.max}</strong>{complete && <span className="tag-chip">{t(severityKey(kind, total))}</span>}</div>
    {complete && needsAttention(kind, answers) && <Notice error>{t('attentionNote')}</Notice>}
    <Field label={t('caption')}><input value={note} maxLength={500} onChange={e => setNote(e.target.value)}/></Field>
    <p className="hint">{t('phqDisclaimer')}</p>
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t(busy ? 'working' : 'save')}</button></div>
  </form></Modal>;
}
/** Score trajectory with the severity bands drawn behind it. */
function ScoreChart({ entries }: { entries: Assessment[] }) {
  const { t, language } = useI18n(); const kind = entries[0].kind; const { max, bands } = INSTRUMENTS[kind];
  const W = 320; const H = 130; const left = 26; const right = 10; const top = 8; const bottom = 18; const plotW = W - left - right; const plotH = H - top - bottom;
  const times = entries.map(e => Date.parse(`${e.date}T12:00:00Z`)); const first = times[0]; const span = Math.max(1, times.at(-1)! - first);
  const x = (i: number) => left + (entries.length === 1 ? plotW / 2 : (times[i] - first) / span * plotW); const y = (score: number) => top + plotH - score / max * plotH;
  const points = entries.map((e, i) => [x(i), y(scoreOf(kind, e.answers))] as const);
  const summary = `${t(`${kind}Title` as TextKey)}: ${entries.map(e => `${dateLabel(e.date, language, { day: 'numeric', month: 'short' })} ${scoreOf(kind, e.answers)}`).join(', ')}`;
  return <svg className="score-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t('chartOfScores')}. ${summary}`}>
    {bands.map((band, i) => { const to = bands[i + 1]?.from ?? max + 1; return <rect key={band.key} x={left} width={plotW} y={y(Math.min(max, to - 0.0001))} height={Math.max(0, y(band.from) - y(Math.min(max, to - 0.0001)))} className={`band band-${i}`}><title>{t(`sev_${band.key}` as TextKey)}</title></rect>; })}
    {[0, Math.round(max / 2), max].map(tick => <g key={tick}><text x={left - 4} y={y(tick) + 3} textAnchor="end" className="chart-tick">{tick}</text></g>)}
    {points.length > 1 && <polyline points={points.map(p => p.join(',')).join(' ')} className="score-line-path"/>}
    {points.map(([px, py], i) => <circle key={entries[i].id} cx={px} cy={py} r={3.5} className="score-dot"><title>{`${dateLabel(entries[i].date, language, { day: 'numeric', month: 'long', year: 'numeric' })}: ${scoreOf(kind, entries[i].answers)}`}</title></circle>)}
    <text x={left} y={H - 4} className="chart-tick">{dateLabel(entries[0].date, language, { day: 'numeric', month: 'short', year: '2-digit' })}</text>
    {entries.length > 1 && <text x={W - right} y={H - 4} textAnchor="end" className="chart-tick">{dateLabel(entries.at(-1)!.date, language, { day: 'numeric', month: 'short', year: '2-digit' })}</text>}
  </svg>;
}
export function AssessmentsSection({ vault, clientId }: { vault: VaultController; clientId: string }) {
  const { t, language } = useI18n(); const data = vault.data!; const [adding, setAdding] = useState(false);
  const groups = KINDS.map(kind => ({ kind, entries: history(data.assessments, clientId, kind) })).filter(g => g.entries.length);
  return <section className="card"><div className="section-heading flex-wrap"><div><h2><ClipboardList size={18}/> {t('questionnaires')}</h2></div><button className="btn btn-secondary btn-small" onClick={() => setAdding(true)}><Plus size={16}/>{t('addQuestionnaire')}</button></div>
    {groups.length ? groups.map(({ kind, entries }) => { const latest = entries.at(-1)!; const total = scoreOf(kind, latest.answers); const delta = changeSincePrevious(entries);
      return <div className="assessment-group" key={kind}><h3>{t(`${kind}Title` as TextKey)}</h3>
        <div className="score-line"><span>{t('scoreLabel')}</span><strong>{total} / {INSTRUMENTS[kind].max}</strong><span className="tag-chip">{t(severityKey(kind, total))}</span>{delta !== null && <span className={delta <= 0 ? 'ok-text' : 'warn-text'}>{t('changeLabel')}: {delta > 0 ? '+' : delta < 0 ? '−' : '±'}{Math.abs(delta)}</span>}</div>
        {needsAttention(kind, latest.answers) && <Notice error>{t('attentionNote')}</Notice>}
        <ScoreChart entries={entries}/>
        <ul className="passkey-list">{[...entries].reverse().map(e => <li key={e.id}><span>{dateLabel(e.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {scoreOf(kind, e.answers)} · {t(severityKey(kind, scoreOf(kind, e.answers)))}{e.note ? ` · ${e.note}` : ''}</span>
          <button className="icon-btn danger" title={t('deleteAssessment')} aria-label={`${t('deleteAssessment')}: ${dateLabel(e.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}`} onClick={() => { if (window.confirm(t('deleteAssessmentConfirm'))) void vault.remove(d => { d.assessments = d.assessments.filter(a => a.id !== e.id); }).catch(() => {}); }}><Trash2 size={16}/></button></li>)}</ul></div>; })
      : <p className="hint">{t('noQuestionnaires')}</p>}
    <p className="hint">{t('phqDisclaimer')}</p>
    {adding && <AssessmentForm vault={vault} clientId={clientId} onClose={() => setAdding(false)}/>}</section>;
}
