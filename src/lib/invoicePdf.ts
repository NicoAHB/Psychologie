import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { bankFor } from './currency';
import { dateLabel, money } from './dates';
import { translate, type TextKey } from './i18n';
import type { Invoice } from './types';
import { invoicePaymentTerm, invoiceTitleKey, isCancellation } from './invoice';

/** Local, searchable A4 export with embedded Cyrillic fonts. No clinical notes or internal EUR comparison. */
export async function invoicePdf(invoice: Invoice, paid: string | null, regularBytes: Uint8Array, boldBytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true }); const bold = await pdf.embedFont(boldBytes, { subset: true });
  const ink = rgb(.15, .24, .21), sage = rgb(.26, .42, .38), muted = rgb(.4, .47, .42), paper = rgb(.956, .969, .949), line = rgb(.87, .9, .87);
  const T = (key: TextKey) => translate(invoice.language, key);
  const date = (value: string) => dateLabel(value, invoice.language, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const amount = (cents: number) => money(cents, invoice.language, invoice.currency ?? 'EUR');
  const account = invoice.paymentAccount ?? bankFor(invoice.sender, invoice.currency ?? 'EUR');
  const left = 48, right = 547.28, width = right - left; let page!: PDFPage; let y = 765;
  const wrap = (text: string, size: number, max: number, font = regular) => {
    const lines: string[] = [];
    for (const paragraph of text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').split(/\r?\n/)) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= max) { current = next; continue; }
        if (current) { lines.push(current); current = ''; }
        // Even a long IBAN, invoice number or unbroken description stays inside its column.
        for (const char of word) { if (current && font.widthOfTextAtSize(current + char, size) > max) { lines.push(current); current = ''; } current += char; }
      }
      lines.push(current);
    }
    return lines;
  };
  const draw = (text: string, x: number, at: number, size = 10, font: PDFFont = regular, color = ink) => page.drawText(text, { x, y: at, size, font, color });
  function newPage() {
    page = pdf.addPage([595.28, 841.89]); page.drawRectangle({ x: left, y: 791, width, height: 3, color: sage }); y = 765;
  }
  function ensure(height: number) { if (y - height < 70) newPage(); }
  function paragraph(text: string, size = 10, font = regular, color = ink, max = width, x = left) {
    for (const value of wrap(text, size, max, font)) { ensure(size * 1.6); draw(value, x, y, size, font, color); y -= size * 1.6; }
  }
  function tableHead() {
    ensure(35); page.drawRectangle({ x: left, y: y - 19, width, height: 29, color: paper });
    draw(T('invoiceServiceDate'), left + 8, y - 8, 8, regular, muted); draw(T('invoiceItem'), left + 100, y - 8, 8, regular, muted);
    const title = T('invoiceAmount'); draw(title, right - 8 - regular.widthOfTextAtSize(title, 8), y - 8, 8, regular, muted); y -= 37;
  }
  newPage();
  paragraph(T(invoiceTitleKey(invoice)), 28, bold, sage); y -= 4;
  paragraph(`${T('invoiceNumber')}: ${invoice.number}`, 10, bold);
  paragraph(`${T('invoiceDate')}: ${date(invoice.issuedAt)}`, 10, regular, muted);
  if (invoice.dueOn && !isCancellation(invoice)) paragraph(`${T('invoiceDueOn')}: ${invoicePaymentTerm(invoice)}`, 10, regular, muted);
  y -= 19;
  if (invoice.sender.name) paragraph(invoice.sender.name, 16, bold);
  if (invoice.sender.address) paragraph(invoice.sender.address, 9.5, regular, muted);
  if (invoice.sender.taxId) paragraph(`${T('invoiceTaxId')}: ${invoice.sender.taxId}`, 9, regular, muted);
  y -= 24;
  paragraph(T('invoiceRecipient').toLocaleUpperCase(invoice.language), 8, regular, muted); y -= 5;
  paragraph(invoice.recipient.name, 14, bold); if (invoice.recipient.address) paragraph(invoice.recipient.address, 10); y -= 24;
  const reference = invoice.cancels ?? invoice.replaces;
  if (reference) { paragraph(T(invoice.cancels ? 'invoiceCancels' : 'invoiceReplaces').replace('{number}', reference.number).replace('{date}', date(reference.issuedAt)), 10, bold, sage); if (invoice.correctionReason) paragraph(invoice.correctionReason, 9, regular, muted); y -= 16; }
  tableHead();
  for (const item of invoice.lines) {
    const descriptions = wrap(item.description, 10, 258); const price = wrap(amount(item.amountCents), 10, 122, bold); const height = Math.max(descriptions.length, price.length) * 16 + 18;
    if (height < 660 && y - height < 75) { newPage(); tableHead(); }
    const count = Math.max(descriptions.length, price.length);
    for (let i = 0; i < count; i++) {
      if (y < 90) { newPage(); tableHead(); }
      if (i === 0) draw(date(item.date), left + 8, y, 9);
      if (descriptions[i]) draw(descriptions[i], left + 100, y, 10);
      if (price[i]) draw(price[i], right - 8 - bold.widthOfTextAtSize(price[i], 10), y, 10, bold);
      y -= 16;
    }
    y -= 7; page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: .6, color: line }); y -= 14;
  }
  const totals = wrap(amount(invoice.totalCents), 18, 235, bold); ensure(35 + totals.length * 24);
  y -= 12; draw(T('invoiceTotal'), left + 8, y, 13, bold, sage);
  for (const text of totals) { draw(text, right - 8 - bold.widthOfTextAtSize(text, 18), y, 18, bold, sage); y -= 24; }
  y -= 18;
  if (invoice.sender.taxNote) { paragraph(invoice.sender.taxNote, 9, regular, muted); y -= 14; }
  if (isCancellation(invoice)) {
    paragraph(T('invoiceCancellationNote'), 10, regular, sage);
  } else if (paid) {
    paragraph(T('invoicePaid').replace('{date}', date(paid)), 11, bold, sage);
  } else if (account.iban) {
    ensure(135); paragraph(T('invoicePaymentDetails'), 12, bold, sage); y -= 6;
    paragraph(T('invoicePayTo'), 9, regular, muted);
    if (account.holder) paragraph(account.holder, 10, bold);
    paragraph(`IBAN: ${account.iban}`, 10, bold);
    if (account.bank) paragraph(account.bank, 9, regular, muted);
    if (account.bic) paragraph(`BIC / SWIFT: ${account.bic}`, 9, regular, muted);
    paragraph(`${T('invoiceReference')}: ${invoice.number}`, 9);
  }
  y -= 22; paragraph(T('invoiceThanks'), 10, regular, sage);
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: left, y: 48 }, end: { x: right, y: 48 }, thickness: .6, color: line });
    const footer = `${invoice.number} · ${i + 1} / ${pages.length}`;
    p.drawText(footer, { x: right - regular.widthOfTextAtSize(footer, 8), y: 32, size: 8, font: regular, color: muted });
  });
  pdf.setTitle(`${T(invoiceTitleKey(invoice))} ${invoice.number}`); pdf.setCreator('Praxisraum'); pdf.setProducer('Praxisraum');
  return new Uint8Array(await pdf.save());
}
