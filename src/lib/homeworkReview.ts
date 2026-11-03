import { clientHomework, materializeLegacyHomework, updateHomework, updateHomeworkReturnPlan } from './homework';
import { validHomeworkReview, type HomeworkAssignment, type HomeworkReviewDraft, type HomeworkReviewValues } from './homeworkTypes';
import type { VaultData } from './types';

const fields = ['status','feedback','dueOn','returnExpected'] as const;
export const homeworkReviewValues = (a: HomeworkAssignment): HomeworkReviewValues => ({ status:a.state.value, feedback:a.feedback, dueOn:a.dueOn??'', returnExpected:a.returnExpected });
export const sameHomeworkReview = (a:HomeworkReviewValues,b:HomeworkReviewValues) => fields.every(key=>a[key]===b[key]);

export function saveHomeworkReviewDraft(data:VaultData,clientId:string,id:string,draft:HomeworkReviewDraft) {
  if(!validHomeworkReview(draft.base)||!validHomeworkReview(draft.values)||!Number.isFinite(Date.parse(draft.savedAt)) || !clientHomework(data,clientId).some(a=>a.id===id))throw new Error('hwInvalid');
  const row=materializeLegacyHomework(data,id);
  if(sameHomeworkReview(draft.base,draft.values))delete row.reviewDraft;
  else row.reviewDraft=structuredClone(draft);
}
export function reviewConflicts(base:HomeworkReviewValues,values:HomeworkReviewValues,current:HomeworkReviewValues) {
  return fields.filter(key=>values[key]!==base[key]&&current[key]!==base[key]&&current[key]!==values[key]);
}
/** Apply only fields actually edited in this form. A changed remote value must
 * be reviewed explicitly; a stale acknowledgement never overwrites a new edit. */
export function commitHomeworkReview(data:VaultData,clientId:string,id:string,base:HomeworkReviewValues,values:HomeworkReviewValues,acknowledged?:HomeworkReviewValues) {
  if(!validHomeworkReview(base)||!validHomeworkReview(values))throw new Error('hwInvalid');
  const row=clientHomework(data,clientId).find(a=>a.id===id);if(!row)throw new Error('hwInvalid');
  const current=homeworkReviewValues(row);
  if(reviewConflicts(base,values,current).length&&(!acknowledged||!sameHomeworkReview(acknowledged,current)))throw new Error('hwReviewConflict');
  const merged={...current};
  for(const key of fields)if(values[key]!==base[key])Object.assign(merged,{[key]:values[key]});
  updateHomework(data,id,merged.status,merged.feedback,merged.dueOn);
  updateHomeworkReturnPlan(data,id,merged.returnExpected,merged.dueOn);
  const stored=materializeLegacyHomework(data,id);
  // Another device's pending draft is not an implicit part of this approval.
  if(stored.reviewDraft&&sameHomeworkReview(stored.reviewDraft.values,values)&&sameHomeworkReview(stored.reviewDraft.base,base))delete stored.reviewDraft;
}
