import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n, type TextKey } from '../lib/i18n';
import type { HomeworkAssignment, HomeworkReviewValues, HomeworkStatus } from '../lib/homeworkTypes';
import { homeworkReviewValues, reviewConflicts, sameHomeworkReview } from '../lib/homeworkReview';
import { nextHomeworkDue } from '../lib/homeworkWorkflow';
import { useHomeworkReview } from '../lib/useHomeworkReview';
import { useSaveStatus } from '../lib/useSaveStatus';
import type { VaultController } from '../lib/useVault';
import { SaveButton } from './SaveButton';
import { Field, Notice } from './ui';

export function HomeworkReviewForm({vault,assignment,onFlush}:{vault:VaultController;assignment:HomeworkAssignment;onFlush:(flush:()=>Promise<boolean>)=>void}) {
  const {t}=useI18n(),review=useHomeworkReview(vault,assignment),save=useSaveStatus();
  const [error,setError]=useState<TextKey>(),[acknowledged,setAcknowledged]=useState<HomeworkReviewValues>();
  const current=homeworkReviewValues(assignment),conflicts=reviewConflicts(review.base,review.values,current);
  const savingJob=useRef<Promise<boolean>|undefined>(undefined);
  const nextDue=nextHomeworkDue(vault.data!,assignment.clientId);
  onFlush(async()=>{await savingJob.current;await review.flush();return true;});
  useEffect(()=>{if(review.restored&&review.dirty)save.changed();},[]);
  const change=(patch:Partial<HomeworkReviewValues>)=>{review.change(patch);setAcknowledged(undefined);save.changed();setError(undefined);};
  async function submit(e:FormEvent) {
    e.preventDefault();setError(undefined);
    try{const job=save.save(()=>review.commit(acknowledged));savingJob.current=job;await job;setAcknowledged(undefined);}
    catch(e){setError(e instanceof Error&&e.message==='hwReviewConflict'?'hwReviewConflict':'storageError');}finally{savingJob.current=undefined;}
  }
  return <form className="hw-review-form" onSubmit={submit}>
    <h4>{t('hwReviewHeading')}</h4>
    {review.restored&&review.dirty&&<Notice>{t('hwDraftResumed')}</Notice>}
    <fieldset className="hw-review-fields" disabled={save.saving}>
      <Field label={t('hwStatus')}><select value={review.values.status} onChange={e=>change({status:e.target.value as HomeworkStatus})}>{(['open','deferred','discussed','ended'] as const).map(value=><option value={value} key={value}>{t(`hwState_${value}`)}</option>)}</select></Field>
      <Field label={t('hwDueOn')}><input type="date" value={review.values.dueOn} onChange={e=>change({dueOn:e.target.value})}/></Field>
      <div className="button-row hw-date-actions">{nextDue&&<button type="button" className="btn btn-secondary" onClick={()=>change({dueOn:nextDue})}>{t('hwNextAppointmentDue')}</button>}{review.values.dueOn&&<button type="button" className="btn btn-ghost" onClick={()=>change({dueOn:''})}>{t('hwClearDue')}</button>}</div>
      <label className="check-label"><input type="checkbox" checked={review.values.returnExpected} onChange={e=>change({returnExpected:e.target.checked})}/><span>{t('hwExpectReturn')}</span></label>
      <Field label={t('hwFeedback')} hint={t('hwFeedbackHint')}><textarea rows={5} maxLength={4000} value={review.values.feedback} onChange={e=>change({feedback:e.target.value})}/></Field>
    </fieldset>
    {review.dirty&&<p className="hint" role="status">{t(review.draftStatus==='error'?'hwDraftSaveError':review.draftStatus==='saved'?'hwDraftSaved':'hwDraftSaving')}</p>}
    {conflicts.length>0&&<section className="hw-review-conflict"><Notice>{t('hwReviewConflict')}</Notice><h5>{t('hwCurrentVersion')}</h5><p>{t(`hwState_${current.status}`)}{current.dueOn?` · ${current.dueOn}`:''}</p><p className="pre-line">{current.feedback||t('hwNoFeedback')}</p><label className="check-label"><input type="checkbox" checked={!!acknowledged&&sameHomeworkReview(acknowledged,current)} onChange={e=>setAcknowledged(e.target.checked?current:undefined)}/><span>{t('hwReviewOverwrite')}</span></label></section>}
    {error&&<Notice error>{t(error)}</Notice>}<div className="form-actions"><SaveButton status={save} disabled={!!conflicts.length&&(!acknowledged||!sameHomeworkReview(acknowledged,current))}/></div>
  </form>;
}
