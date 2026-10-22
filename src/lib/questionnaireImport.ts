import { PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { INSTRUMENTS, isComplete, scoreOf } from './assessments';
import { isIsoDay } from './dates';
import type { AssessmentKind } from './types';

export interface ImportedQuestionnaire { kind: AssessmentKind; answers: number[]; score: number; completedOn?: string; name?: string }
/** Reads AcroForm data only. PDF JavaScript, links and attachments are never executed or fetched. */
export async function readQuestionnaire(bytes: Uint8Array, expected: AssessmentKind, documentId: string): Promise<ImportedQuestionnaire> {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('questionnaireImportInvalid');
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    if (pdf.isEncrypted || pdf.getPageCount() > 20) throw new Error();
    const form = pdf.getForm(); const fields = form.getFields(); if (fields.length > 80) throw new Error();
    const text = (name: string) => { const field = form.getFieldMaybe(name); return field instanceof PDFTextField ? field.getText()?.trim() : undefined; };
    const kind = text('praxisraum_instrument'); const version = text('praxisraum_version'); const reference = text('praxisraum_document_id');
    if (kind && kind !== expected || version && version !== '1' || reference && reference !== documentId) throw new Error('questionnaireImportMismatch');
    const answerFields = fields.filter(field => /^answer_\d+$/.test(field.getName()));
    if (answerFields.length !== INSTRUMENTS[expected].items) throw new Error();
    const answers = Array.from({ length: INSTRUMENTS[expected].items }, (_, index) => {
      const field = form.getFieldMaybe(`answer_${index + 1}`); const value = field instanceof PDFRadioGroup ? field.getSelected() : undefined;
      return value && /^[0-3]$/.test(value) ? Number(value) : null;
    });
    if (!isComplete(expected, answers)) throw new Error('questionnaireImportIncomplete');
    const entered = text('completed_on'); let completedOn: string | undefined;
    if (entered) {
      const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(entered);
      const iso = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : entered;
      if (isIsoDay(iso)) completedOn = iso;
    }
    return { kind: expected, answers, score: scoreOf(expected, answers), completedOn, name: text('client_name')?.slice(0, 200) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new Error(['questionnaireImportMismatch', 'questionnaireImportIncomplete'].includes(message) ? message : 'questionnaireImportInvalid');
  }
}
