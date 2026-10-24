import { useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import { translate, useI18n } from '../lib/i18n';
import { applyFollowUpReason, FOLLOW_UP_NOTE_MAX, FOLLOW_UP_REASONS } from '../lib/followUpReasons';
import { Field, Notice } from './ui';

const presetTexts = FOLLOW_UP_REASONS.flatMap(reason => [translate('de', reason), translate('uk', reason)]);

export function FollowUpFields({ date, note, disabled, onDate, onNote }: {
  date: string; note: string; disabled: boolean;
  onDate: (date: string) => void; onNote: (note: string) => void;
}) {
  const { t } = useI18n();
  const [tooLong, setTooLong] = useState(false);
  return <fieldset className="follow-up-fields">
    <legend><CalendarClock size={18} aria-hidden="true"/>{t('followUpTitle')}</legend>
    <p className="hint">{t('followUpHint')}</p>
    <div className="follow-up-date-controls">
      <Field label={t('clientFollowUpOn')}><input type="date" value={date} disabled={disabled} onChange={e => onDate(e.target.value)}/></Field>
      <div className="follow-up-date-actions"><button type="button" className="btn btn-secondary" aria-label={t('clientFollowUpClear')} disabled={disabled || !date} onClick={() => onDate('')}><Trash2 size={16} aria-hidden="true"/>{t('clearDate')}</button></div>
    </div>
    <Field label={t('followUpReasonPick')} hint={t('followUpReasonHint')}><select value="" disabled={disabled} onChange={e => {
      const reason = FOLLOW_UP_REASONS.find(key => key === e.target.value);
      if (!reason) return;
      setTooLong(false);
      try { onNote(applyFollowUpReason(note, t(reason), presetTexts, [translate('de', reason), translate('uk', reason)])); }
      catch { setTooLong(true); }
    }}><option value="">{t('followUpReasonChoose')}</option>{FOLLOW_UP_REASONS.map(reason => <option key={reason} value={reason}>{t(reason)}</option>)}</select></Field>
    <Field label={t('clientFollowUpNote')}><textarea rows={3} value={note} disabled={disabled} maxLength={FOLLOW_UP_NOTE_MAX} placeholder={t('followUpNotePlaceholder')} onChange={e => { setTooLong(false); onNote(e.target.value); }}/></Field>
    {tooLong && <Notice error>{t('followUpReasonTooLong')}</Notice>}
  </fieldset>;
}
