import { translate } from './i18n';
import { referralRate, validReferralCode } from './referrals';
import type { Language } from './types';
export function referralExplanation(language: Language, terms: { rateBps: number; months: number }) {
  return translate(language, 'referralExplanation').replace('{months}', String(terms.months)).replace('{rate}', referralRate(terms.rateBps, language));
}
/** Canvas and system fonts only: no DOM screenshot library, external images, tracking or requests. */
export function referralCardCanvas(code: string, language: Language, practice: string, terms: { rateBps: number; months: number }): HTMLCanvasElement {
  if (!validReferralCode(code)) throw new Error('referralInvalidCode');
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('referralCardError');
  const width = 1080, margin = 80, contentWidth = width - margin * 2;
  const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  function lines(text: string, size: number, weight = 400) {
    ctx!.font = `${weight} ${size}px ${font}`;
    const result: string[] = []; let line = '';
    for (const word of text.split(/\s+/u)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx!.measureText(next).width > contentWidth && line) { result.push(line); line = word; } else line = next;
      // Bound even a practice name without spaces; preserve Unicode codepoints.
      while (ctx!.measureText(line).width > contentWidth) {
        const chars = Array.from(line); let cut = chars.length - 1;
        while (cut > 1 && ctx!.measureText(chars.slice(0,cut).join('')).width > contentWidth) cut--;
        result.push(chars.slice(0,cut).join('')); line = chars.slice(cut).join('');
      }
    }
    if (line) result.push(line); return result;
  }
  const sections = [
    { text: practice.trim().slice(0,100) || 'Praxisraum', size: 30, weight: 600, gap: 30 },
    { text: translate(language, 'referralCardTitle'), size: 48, weight: 700, gap: 40 },
    { text: translate(language, 'referralCardText').replace('[CODE]', code), size: 32, weight: 400, gap: 40 },
    { text: code, size: 54, weight: 700, gap: 40 },
    { text: referralExplanation(language, terms), size: 28, weight: 400, gap: 0 },
  ].map(s => ({ ...s, lines: lines(s.text,s.size,s.weight), lineHeight: Math.ceil(s.size * 1.5) }));
  canvas.width = width; canvas.height = margin * 2 + sections.reduce((height,s) => height + s.lines.length * s.lineHeight + s.gap,0);
  const gradient = ctx.createLinearGradient(0,0,width,canvas.height); gradient.addColorStop(0,'#e4efec'); gradient.addColorStop(1,'#e5edf8');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,width,canvas.height);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(32,32,width-64,canvas.height-64);
  ctx.fillStyle = '#243c46'; ctx.textBaseline = 'top'; let y = margin;
  for (const s of sections) { ctx.font = `${s.weight} ${s.size}px ${font}`; for (const line of s.lines) { ctx.fillText(line,margin,y); y += s.lineHeight; } y += s.gap; }
  return canvas;
}
export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('referralCardError')), 'image/png'));
}
