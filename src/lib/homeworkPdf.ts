import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { translate, type TextKey } from './i18n';
import { validHomeworkSnapshot, type HomeworkSnapshot } from './homeworkTypes';

/** Deliberately excludes review notes, payment data and the rest of the client record. */
export interface HomeworkPdfInput { assignmentId: string; snapshot: HomeworkSnapshot }

function lines(text: string, font: PDFFont, size: number, width: number): string[] {
  return text.split(/\r?\n/).flatMap(paragraph => {
    const result: string[] = []; let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { result.push(line); line = ''; }
      for (const letter of word) {
        if (line && font.widthOfTextAtSize(line + letter, size) > width) { result.push(line); line = ''; }
        line += letter;
      }
      line += ' ';
    }
    result.push(line.trimEnd()); return result;
  });
}

/** Local AcroForm with embedded Unicode resources. No PDF JavaScript or external resources. */
export async function homeworkPdf(input: HomeworkPdfInput, regularBytes: Uint8Array, boldBytes = regularBytes): Promise<Uint8Array<ArrayBuffer>> {
  if (!input.assignmentId || !validHomeworkSnapshot(input.snapshot)) throw new Error('hwInvalid');
  const { snapshot } = input, content = snapshot.content;
  const T = (key: TextKey) => translate(snapshot.language, key);
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes), bold = await pdf.embedFont(boldBytes);
  const form = pdf.getForm(), ink = rgb(.13,.2,.24), muted = rgb(.3,.37,.4), accent = rgb(.24,.4,.39);
  form.acroForm.dict.set(PDFName.of('DR'), pdf.context.obj({ Font: { [regular.name]: regular.ref } }));
  form.acroForm.dict.set(PDFName.of('DA'), PDFString.of(`/${regular.name} 11 Tf 0 g`));
  for (const [name,value] of Object.entries({ praxisraum_homework: '1', praxisraum_assignment_id: input.assignmentId, praxisraum_template_id: snapshot.templateId, praxisraum_template_version: snapshot.version })) {
    const field = form.createTextField(name); field.setText(value); field.enableReadOnly();
  }
  let page: PDFPage, y = 0;
  function newPage() {
    page = pdf.addPage([595.28,841.89]); y = 770;
    page.drawText('Praxisraum', { x:48,y:800,size:11,font:bold,color:accent });
    page.drawLine({ start:{x:48,y:787},end:{x:547,y:787},thickness:.6,color:accent });
  }
  function paragraph(text: string, size = 11, font = regular, color = ink) {
    for (const line of lines(text,font,size,499)) {
      if (y < 75) newPage();
      if (line) page.drawText(line,{x:48,y,size,font,color}); y -= size*1.45;
    }
    y -= 9;
  }
  function field(name:string,height:number,value?:string) {
    if (y-height < 70) newPage();
    const entry=form.createTextField(name); entry.acroField.setDefaultAppearance(`/${regular.name} 11 Tf 0 g`);
    if (height>40) entry.enableMultiline();
    if (value) entry.setText(value);
    entry.addToPage(page,{x:48,y:y-height,width:499,height,borderWidth:.6,borderColor:muted,backgroundColor:rgb(.98,.99,.99),font:regular}); y-=height+20;
  }
  newPage(); paragraph(content.title,21,bold);
  paragraph(T('hwPdfInstructions'),10,regular,muted);
  if (snapshot.pdfClientName) { paragraph(T('pdfClientName'),10,bold); field('client_name',30,snapshot.pdfClientName); }
  paragraph(T('date'),10,bold); field('completed_on',30);
  if (content.goal) { paragraph(T('hwGoal'),12,bold); paragraph(content.goal); }
  paragraph(T('hwSteps'),12,bold); paragraph(content.steps);
  if(content.rhythm) { paragraph(T('hwRhythm'),12,bold); paragraph(content.rhythm); }
  const questions=content.questions.length?content.questions:[T('hwPdfReflection')];
  for(const [i,question] of questions.entries()) {
    // Keep the end of a long prompt next to its answer box across page boundaries.
    if(y<235)newPage(); paragraph(question,11,bold); field(`reflection_${i+1}`,115);
  }
  paragraph(T('hwPdfOptional'),10,regular,muted);
  const pages=pdf.getPages(); pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:492,y:40,size:9,font:regular,color:muted}));
  pdf.setTitle(content.title); pdf.setProducer('Praxisraum'); pdf.setCreator('Praxisraum');
  form.updateFieldAppearances(regular);
  return new Uint8Array(await pdf.save());
}
