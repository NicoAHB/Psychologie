import { useI18n } from '../lib/i18n';
import { timeAt, type TimeAt } from '../lib/zones';

/** "18:00 Uhr" in German, "18:00" in Ukrainian. */
export const clockText = (time: string, language: 'de' | 'uk') => language === 'de' ? `${time} Uhr` : time;
const dayNote = (shift: number, t: ReturnType<typeof useI18n>['t']) => shift > 0 ? t('dayLater') : shift < 0 ? t('dayEarlier') : '';
function Cell({ at, label, client = false }: { at: TimeAt; label: string; client?: boolean }) {
  const { t, language } = useI18n();
  return <div className={`dual-cell ${client ? 'is-client' : ''}`}><span className="dual-label">{label}</span><strong>{clockText(at.time, language)}</strong>
    <small>{at.place} · {at.offset}{client && dayNote(at.shift, t) ? ` · ${dayNote(at.shift, t)}` : ''}</small></div>;
}
/**
 * Both local times of one moment, side by side and unmistakably labelled, plus the sentence the practitioner can
 * repeat to the client ("for the client the appointment is at 19:00"). With equal clocks a single cell is shown.
 */
export function DualTimeBox({ instant, practiceZone, clientZone }: { instant: string; practiceZone: string; clientZone: string }) {
  const { t, language } = useI18n();
  const practice = timeAt(instant, practiceZone, practiceZone, language); const theirs = timeAt(instant, clientZone, practiceZone, language);
  const differs = theirs.zone !== practice.zone && (theirs.time !== practice.time || theirs.iso !== practice.iso);
  return <div className="dual-time" role="group" aria-label={t('bothTimes')} aria-live="polite">
    <div className="dual-cells">{differs
      ? <><Cell at={practice} label={`${t('practiceTime')} · ${practice.tag}`}/><Cell at={theirs} label={`${t('clientTime')} · ${theirs.tag}`} client/></>
      : <Cell at={practice} label={`${t('practiceAndClient')} · ${practice.tag}`}/>}</div>
    {differs && <p className="dual-sentence">{t('forClientSentence').replace('{time}', theirs.time).replace('{place}', theirs.place)}{theirs.shift ? ` (${dayNote(theirs.shift, t)})` : ''}</p>}
  </div>;
}
/** Compact pair for list rows: "18:00 DE" above "19:00 UA". */
export function TimePair({ practice, client, differs }: { practice: TimeAt; client: TimeAt; differs: boolean }) {
  const { t } = useI18n();
  return <div className="time-pair"><span className="t-line" title={`${t('practiceTime')}: ${practice.place}, ${practice.offset}`}><strong>{practice.time}</strong><em>{practice.tag}</em></span>
    {differs && <span className="t-line is-client" title={`${t('clientTime')}: ${client.place}, ${client.offset}`}><strong>{client.time}</strong><em>{client.tag}</em>{client.shift !== 0 && <sup>{client.shift > 0 ? '+1' : '−1'}</sup>}</span>}</div>;
}
