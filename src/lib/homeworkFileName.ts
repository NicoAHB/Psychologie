import {translate} from './i18n';
import type {HomeworkPdfInput} from './homeworkPdf';

export function homeworkFileName(input:HomeworkPdfInput):string {
  const safe=Array.from(input.snapshot.content.title.normalize('NFKC').replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s+/g,'-')).slice(0,70).join('')||translate(input.snapshot.language,'hwWorksheetFileName');
  const suffix=input.assignmentId.replace(/[^a-zA-Z0-9]/g,'').slice(-8);
  return `Praxisraum-${safe}${suffix?`-${suffix}`:''}.pdf`;
}

