import { useCallback, useEffect, useRef, useState } from 'react';
import { registerBeforeLock } from './autoLock';
import { commitHomeworkReview, homeworkReviewValues, sameHomeworkReview, saveHomeworkReviewDraft } from './homeworkReview';
import type { HomeworkAssignment, HomeworkReviewValues } from './homeworkTypes';
import type { VaultController } from './useVault';

/** Pending changes remain encrypted drafts, not approved clinical records. A
 * single drain coalesces typing and is awaited by the existing lock/backup gate. */
export function useHomeworkReview(vault:VaultController,assignment:HomeworkAssignment) {
  const [initial]=useState(()=>assignment.reviewDraft??{base:homeworkReviewValues(assignment),values:homeworkReviewValues(assignment)});
  const [values,setValues]=useState(initial.values),[draftStatus,setDraftStatus]=useState<'idle'|'pending'|'saving'|'saved'|'error'>(assignment.reviewDraft?'saved':'idle');
  const [restored]=useState(!!assignment.reviewDraft);
  const base=useRef(initial.base),revision=useRef(0),persisted=useRef(0),inFlight=useRef<Promise<void>|undefined>(undefined);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),key=useRef(vault.getKey());
  const latest=useRef({vault,assignment,values});latest.current={vault,assignment,values};
  const flush=useCallback(async()=>{
    clearTimeout(timer.current);
    if(inFlight.current)return inFlight.current;
    if(persisted.current===revision.current)return;
    const drain=async()=>{
      while(persisted.current!==revision.current) {
        const current=latest.current,version=revision.current,draft={base:structuredClone(base.current),values:structuredClone(current.values),savedAt:new Date().toISOString()};
        setDraftStatus('saving');
        try {
          if(!key.current||current.vault.getKey()!==key.current)throw new Error('locked');
          await current.vault.update(data=>{
            if(current.vault.getKey()!==key.current)throw new Error('locked');
            saveHomeworkReviewDraft(data,current.assignment.clientId,current.assignment.id,draft);
          });
          persisted.current=version;
        } catch(error){setDraftStatus('error');throw error;}
      }
      setDraftStatus('saved');
    };
    const job=drain().finally(()=>{inFlight.current=undefined;});inFlight.current=job;return job;
  },[]);
  const change=(patch:Partial<HomeworkReviewValues>)=>{
    const next={...latest.current.values,...patch};latest.current={...latest.current,values:next};
    revision.current++;setValues(next);setDraftStatus('pending');clearTimeout(timer.current);
    timer.current=setTimeout(()=>void flush().catch(()=>{}),500);
  };
  useEffect(()=>{
    const unregister=registerBeforeLock(flush);
    const hidden=()=>{if(document.visibilityState==='hidden')void flush().catch(()=>{});};
    const pagehide=()=>void flush().catch(()=>{});
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);
    return ()=>{unregister();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);clearTimeout(timer.current);void flush().catch(()=>{});};
  },[flush]);
  useEffect(()=>{
    // Incoming fields refresh an untouched form. Drafts retain their original
    // baseline so overlapping changes can be reviewed, never silently replaced.
    if(sameHomeworkReview(base.current,latest.current.values)) {
      const current=homeworkReviewValues(assignment);base.current=current;latest.current={...latest.current,values:current};setValues(current);
    }
  },[assignment.state.value,assignment.feedback,assignment.dueOn,assignment.returnExpected]);
  async function commit(acknowledged?:HomeworkReviewValues) {
    await flush();const current=latest.current;
    await current.vault.update(data=>{
      if(current.vault.getKey()!==key.current)throw new Error('locked');
      commitHomeworkReview(data,assignment.clientId,assignment.id,base.current,current.values,acknowledged);
    });
    const saved=current.vault.getData()?.homeworkAssignments.find(a=>a.id===assignment.id);if(!saved)return;
    const next=homeworkReviewValues(saved);base.current=next;latest.current={...latest.current,values:next};setValues(next);setDraftStatus('idle');
  }
  return {values,base:base.current,change,flush,commit,draftStatus,restored,dirty:!sameHomeworkReview(base.current,values)};
}
