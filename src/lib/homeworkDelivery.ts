import type { ClientDocument, VaultData } from './types';
import { matchingHomeworkPdf } from './prepareHomeworkPdf';

export function assertHomeworkDocument(data:VaultData,document:ClientDocument) {
  if(!document.homeworkAssignmentId)return;
  const assignment=data.homeworkAssignments.find(a=>a.id===document.homeworkAssignmentId);
  if(!assignment||!matchingHomeworkPdf(document,assignment))throw new Error('hwPdfChanged');
}
/** Includes uncertain requests: a provider may have delivered despite a lost response. */
export function homeworkDeliveryNeedsConfirmation(data:VaultData,document:ClientDocument) {
  if(!document.homeworkAssignmentId)return false;
  return !!data.homeworkAssignments.find(a=>a.id===document.homeworkAssignmentId)?.handovers.length ||
    data.documents.some(d=>d.clientId===document.clientId&&d.homeworkAssignmentId===document.homeworkAssignmentId&&(d.deliveries.length||d.telegramDeliveries?.length));
}
