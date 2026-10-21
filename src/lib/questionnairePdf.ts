import { PDFDocument, PDFName, PDFString, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { INSTRUMENTS } from './assessments';
import { translate, type TextKey } from './i18n';
import type { AssessmentKind, Language } from './types';

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}
/** Genuine AcroForm fields, no PDF JavaScript, no prefilled patient details, and a local Unicode font for DE/UA. */
export async function questionnairePdf(kind: AssessmentKind, language: Language, fontBytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const T = (key: TextKey) => translate(language, key); const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes); const form = pdf.getForm(); const ink = rgb(.17, .27, .22); const muted = rgb(.34, .41, .35);
  // Readers need the full Unicode font in the form's default resources when the patient enters new text.
  form.acroForm.dict.set(PDFName.of('DR'), pdf.context.obj({ Font: { [font.name]: font.ref } }));
  form.acroForm.dict.set(PDFName.of('DA'), PDFString.of(`/${font.name} 11 Tf 0 g`));
  const total = INSTRUMENTS[kind].items; const pages = Math.ceil(total / 5);
  pdf.setTitle(T(`${kind}Title`)); pdf.setSubject(T('pdfFillInstructions')); pdf.setProducer('Praxisraum'); pdf.setCreator('Praxisraum');
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([595.28, 841.89]);
    const draw = (text: string, x: number, y: number, size = 11, color = ink) => page.drawText(text, { x, y, size, font, color });
    draw(T(`${kind}Title`), 48, 788, 23); draw(`${p + 1} / ${pages}`, 505, 791, 10, muted);
    let y = 753;
    for (const line of wrap(T('pdfFillInstructions'), font, 10, 499)) { draw(line, 48, y, 10, muted); y -= 15; }
    if (p === 0) {
      draw(T('pdfClientName'), 48, 697, 10); draw(T('date'), 365, 697, 10);
      const name = form.createTextField('client_name'); name.acroField.setDefaultAppearance(`/${font.name} 12 Tf 0 g`); name.addToPage(page, { x: 48, y: 660, width: 296, height: 28, borderWidth: .7, borderColor: muted, font });
      const date = form.createTextField('completed_on'); date.acroField.setDefaultAppearance(`/${font.name} 12 Tf 0 g`); date.addToPage(page, { x: 365, y: 660, width: 182, height: 28, borderWidth: .7, borderColor: muted, font });
      y = 633;
    } else y = 690;
    for (const line of wrap(T('phqIntro'), font, 11, 499)) { draw(line, 48, y, 11); y -= 16; }
    y -= 25;
    for (let i = p * 5; i < Math.min(total, (p + 1) * 5); i++) {
      const lines = wrap(`${i + 1}. ${T(`${kind}_${i + 1}` as TextKey)}`, font, 11, 499);
      for (const line of lines) { draw(line, 48, y, 11); y -= 15; }
      // ASCII export values plus visible localized labels work across PDF readers, including mobile apps.
      const answer = form.createRadioGroup(`answer_${i + 1}`);
      for (const value of [0, 1, 2, 3]) {
        const x = 48 + (value % 2) * 250; const optionY = y - 30 - Math.floor(value / 2) * 30;
        answer.addOptionToPage(String(value), page, { x, y: optionY, width: 20, height: 20, borderWidth: .8, borderColor: muted });
        const labels = wrap(`${value} · ${T(`answer${value}` as TextKey)}`, font, 9.5, 218);
        labels.forEach((line, index) => draw(line, x + 28, optionY + (labels.length > 1 ? 12 : 6) - index * 11, 9.5));
      }
      y -= 83;
    }
    let footerY = 69;
    for (const line of wrap(T('phqDisclaimer'), font, 9, 499)) { draw(line, 48, footerY, 9, muted); footerY -= 13; }
  }
  form.updateFieldAppearances(font);
  return new Uint8Array(await pdf.save());
}
