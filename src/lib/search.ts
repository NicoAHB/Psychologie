import type { VaultData } from './types';

export type HitKind = 'client' | 'session' | 'note' | 'invoice' | 'assessment';
export interface Hit { kind: HitKind; id: string; clientId: string; title: string; text: string; /** [start, end) ranges in `text` that matched */ marks: [number, number][]; date?: string }

/** Lowercase, ignore accents (ä→a, é→e, й→и) and treat ß as ss. `map[i]` is the index in the original text of folded char i. */
export function fold(text: string): { folded: string; map: number[] } {
  let folded = ''; const map: number[] = [];
  for (let index = 0; index < text.length;) {
    const point = text.codePointAt(index)!; const char = String.fromCodePoint(point);
    const plain = char.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace('ß', 'ss');
    for (const piece of plain) { folded += piece; map.push(index); }
    index += char.length;
  }
  return { folded, map };
}
const WINDOW = 50;
/** The part of `text` around the first match, with match positions relative to the returned excerpt. */
function excerpt(text: string, terms: string[]): { text: string; marks: [number, number][] } {
  const { folded, map } = fold(text); const ranges: [number, number][] = [];
  for (const term of terms) for (let at = folded.indexOf(term); at >= 0; at = folded.indexOf(term, at + term.length)) ranges.push([map[at], (map[at + term.length - 1] ?? text.length) + 1]);
  ranges.sort((a, b) => a[0] - b[0]);
  const first = ranges[0]?.[0] ?? 0; const from = Math.max(0, first - WINDOW); const to = Math.min(text.length, first + WINDOW * 2);
  const cut = `${from > 0 ? '… ' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? ' …' : ''}`;
  // Whitespace collapsing may shorten the excerpt, so marks are recomputed on the final string.
  const { folded: finalFolded, map: finalMap } = fold(cut); const marks: [number, number][] = [];
  for (const term of terms) for (let at = finalFolded.indexOf(term); at >= 0; at = finalFolded.indexOf(term, at + term.length)) marks.push([finalMap[at], (finalMap[at + term.length - 1] ?? cut.length) + 1]);
  return { text: cut, marks: marks.sort((a, b) => a[0] - b[0]) };
}
/** All words of the query must occur (in any order) in one record. Searches everything the vault knows about a client. */
/** Folding every note on every keystroke is the expensive part, so the folded text is remembered per record; a changed text is never served from the cache. */
const foldedCache = new WeakMap<object, { source: string; folded: string }>();
function foldedHaystack(record: object | undefined, source: string) {
  const cached = record && foldedCache.get(record);
  if (cached && cached.source === source) return cached.folded;
  const folded = fold(source).folded;
  if (record) foldedCache.set(record, { source, folded });
  return folded;
}

export function searchVault(data: VaultData, query: string, limit = 40): Hit[] {
  const terms = fold(query.trim()).folded.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const names = new Map(data.clients.map(c => [c.id, c.name]));
  const nameOf = (clientId: string) => names.get(clientId) ?? '';
  const hits: Hit[] = [];
  const consider = (kind: HitKind, id: string, clientId: string, title: string, fields: string[], date?: string, record?: object) => {
    const haystack = foldedHaystack(record, fields.join('\n'));
    if (!terms.every(term => haystack.includes(term))) return;
    const body = fields.find(field => terms.some(term => fold(field).folded.includes(term))) ?? fields[0] ?? '';
    hits.push({ kind, id, clientId, title, ...excerpt(body, terms), date });
  };
  for (const c of data.clients) consider('client', c.id, c.id, c.name, [c.name, c.contact, c.address ?? '', c.preparation], undefined, c);
  for (const s of data.sessions) consider('session', s.id, s.clientId, nameOf(s.clientId), [s.notes, s.homework ?? '', s.tags.map(t => `#${t}`).join(' '), s.date], s.date, s);
  for (const n of data.notes) consider('note', n.id, n.clientId, nameOf(n.clientId), [n.caption, n.tags.map(t => `#${t}`).join(' ')], n.createdAt.slice(0, 10), n);
  for (const i of data.invoices) consider('invoice', i.id, i.clientId, nameOf(i.clientId), [i.number, i.recipient.name], i.issuedAt);
  return hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title)).slice(0, limit);
}
