import { sha256 } from '@noble/hashes/sha2.js';
import type { VaultData } from './types';
import { MEMO_MAX_LABEL, MEMO_MAX_SUMMARY } from './audioMemos';

export const COLLECTIONS = ['clients', 'appointments', 'sessions', 'notes', 'invoices', 'assessments', 'templates', 'documents', 'availability', 'audioMemos', 'sessionDrafts', 'messageTemplates', 'marketingCampaigns', 'newsletters', 'referralCodes', 'referrals', 'referralPayouts'] as const;
type Collection = typeof COLLECTIONS[number] | 'settings';
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Vector = Record<string, number>;
export interface Version { actor: string; sequence: number; at: number; value?: Json }
export interface Register { seen: Vector; values: Version[] }
export interface CrdtState { version: 1; clock: Vector; entities: Record<string, Record<string, Register>> }
export interface SyncConflict { entity: string; collection: Collection; id: string; field: string; variants: Version[] }
type Row = { id: string; updatedAt?: number; [key: string]: unknown };
const canonical = (value: unknown): string => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v) ?? 'undefined';
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const join = (a: Vector, b: Vector): Vector => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map(k => [k, Math.max(a[k] ?? 0, b[k] ?? 0)]));
const dot = (v: Version) => `${v.actor}:${v.sequence}`;
const ordered = (values: Version[]) => values.sort((a, b) => a.at - b.at || dot(a).localeCompare(dot(b), 'en'));
const keyOf = (collection: Collection, id: string) => JSON.stringify([collection, id]);
const digest = (value: unknown) => Array.from(sha256(new TextEncoder().encode(canonical(value))), b => b.toString(16).padStart(2, '0')).join('');

/** State-based multi-value register. Causally overwritten versions disappear; concurrent versions survive.
 * Wall clocks only select the initial display variant, never which information is retained. */
export function mergeRegister(a: Register, b: Register): Register {
  const ad = new Set(a.values.map(dot)), bd = new Set(b.values.map(dot));
  const retained = [...a.values.filter(v => bd.has(dot(v)) || v.sequence > (b.seen[v.actor] ?? 0)), ...b.values.filter(v => ad.has(dot(v)) || v.sequence > (a.seen[v.actor] ?? 0))];
  return { seen: join(a.seen, b.seen), values: ordered([...new Map(retained.map(v => [dot(v), structuredClone(v)])).values()]) };
}
function fields(row: Row, collection: Collection): Record<string, Json | undefined> {
  // Issued invoices and currency/rate/amount tuples are indivisible snapshots.
  if (collection === 'invoices') return { $snapshot: Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id' && k !== 'updatedAt')) as Json };
  if (['referralCodes', 'referrals', 'referralPayouts'].includes(collection)) return {
    $snapshot: Object.fromEntries(Object.entries(row).filter(([k]) => !['id', 'updatedAt', 'firstPaidOn'].includes(k))) as Json,
    ...(collection === 'referrals' && { firstPaidOn: row.firstPaidOn as Json | undefined }),
  };
  const result: Record<string, Json | undefined> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || k === 'updatedAt' || collection === 'settings' && k === 'autoSync') continue;
    if ('feeCents' in row && ['feeCents', 'billing', 'originalFeeCents', 'paidAt', 'invoiceId'].includes(k)) continue;
    if (collection === 'audioMemos' && ['blobId', 'mimeType', 'size', 'durationMs'].includes(k)) continue;
    if (k === 'practice') { for (const [pk, pv] of Object.entries(v as object)) result[`practice.${pk}`] = pv as Json; }
    else if (collection === 'clients' && k === 'marketingConsent') { for (const [channel, consent] of Object.entries(v as object)) result[`marketingConsent:${channel}`] = consent as Json; }
    else if (k === 'tags') { for (const tag of v as string[]) result[`tag:${tag}`] = true; }
    else if (collection === 'settings' && ['memoLabels', 'memoLabelFavorites'].includes(k)) { for (const label of v as string[]) result[`${k === 'memoLabels' ? 'memoLabel' : 'memoFavorite'}:${label}`] = true; }
    else if (['deliveries', 'returns', 'telegramDeliveries', 'statusHistory', 'shares', 'messages', 'recipients'].includes(k)) { for (const entry of v as { id: string }[]) result[`${k}:${entry.id}`] = entry as unknown as Json; }
    else result[k] = v as Json;
  }
  if ('feeCents' in row) result.$amount = Object.fromEntries(['feeCents', 'billing', 'originalFeeCents', 'paidAt', 'invoiceId'].filter(k => row[k] !== undefined).map(k => [k, row[k]])) as Json;
  if (collection === 'audioMemos') result.$recording = Object.fromEntries(['blobId', 'mimeType', 'size', 'durationMs'].map(k => [k, row[k]])) as Json;
  return result;
}
function seed(value: Json | undefined, at: number, actor: string): Register {
  return { seen: { [actor]: 1 }, values: [{ actor, sequence: 1, at, ...(value === undefined ? {} : { value: structuredClone(value) }) }] };
}
/** Deterministic migration: identical legacy fields share a dot even on disconnected devices.
 * Divergent old versions remain alternatives. All metadata stays inside the encrypted vault. */
export function stateOf(data: VaultData): CrdtState {
  if (data.crdt?.version === 1) return adoptUnstamped(data, structuredClone(data.crdt));
  const actor = `legacy-${digest({ ...data, settings: { ...data.settings, autoSync: false } })}`;
  const state: CrdtState = { version: 1, clock: { [actor]: 1 }, entities: {} };
  for (const collection of [...COLLECTIONS, 'settings'] as const) {
    const rows = collection === 'settings' ? [{ ...data.settings, id: 'settings' }] : (data[collection] ?? []) as unknown as Row[];
    rows.forEach((row, index) => {
      const registers = Object.fromEntries(Object.entries({ ...fields(row, collection), $exists: true, $order: index }).map(([k, v]) => [k, seed(v, row.updatedAt ?? 0, actor)]));
      state.entities[keyOf(collection, row.id)] = registers;
      for (const register of Object.values(registers)) state.clock = join(state.clock, register.seen);
    });
  }
  // Legacy tombstones have no collection, so conservatively retain them in every collection.
  for (const [id, at] of Object.entries(data.deleted)) for (const collection of COLLECTIONS) {
    const entity = state.entities[keyOf(collection, id)] ??= {};
    entity.$exists = seed(false, at, actor); state.clock = join(state.clock, entity.$exists.seen);
  }
  return state;
}
function preferred(register: Register, field = '') {
  if (field === 'firstPaidOn') return register.values.map(v => v.value).filter((v): v is string => typeof v === 'string').sort()[0];
  const revoked = /^(shares|marketingConsent):/.test(field) ? register.values.filter(v => v.value && typeof v.value === 'object' && !Array.isArray(v.value) && v.value.revokedAt) : [];
  if (revoked.length) return revoked.at(-1)?.value;
  const accepted = /^(deliveries|telegramDeliveries|recipients):/.test(field) ? register.values.filter(v => v.value && typeof v.value === 'object' && !Array.isArray(v.value) && v.value.acceptedAt) : [];
  return (accepted.length ? accepted : register.values).at(-1)?.value;
}
/** Older app versions can echo unknown CRDT metadata without updating it. Import their actual
 * changed fields as deterministic causal writes; never silently ignore an unstamped receipt. */
function adoptUnstamped(data: VaultData, state: CrdtState): CrdtState {
  for (const collection of [...COLLECTIONS, 'settings'] as const) {
    const rows = collection === 'settings' ? [{ ...data.settings, id: 'settings' }] : (data[collection] ?? []) as unknown as Row[];
    for (const [index, row] of rows.entries()) {
      const entity = keyOf(collection, row.id), registers = state.entities[entity] ?? {}, actual = fields(row, collection);
      // A tombstone remains authoritative until an explicit normal edit/restore acknowledges it.
      if (registers.$exists?.values.some(v => v.value === false)) continue;
      for (const field of new Set([...Object.keys(actual), ...Object.keys(registers).filter(k => !k.startsWith('$') || k === '$snapshot' || k === '$amount' || k === '$recording')])) {
        if (same(actual[field], registers[field] && preferred(registers[field], field))) continue;
        const actor = `legacy-edit-${digest([entity, field, actual[field] ?? null, row.updatedAt ?? 0])}`;
        const sequence = (state.clock[actor] ?? 0) + 1; state.clock[actor] = sequence;
        put(state, entity, field, actual[field], actor, sequence, row.updatedAt ?? 0, true);
      }
      if (!registers.$exists) {
        const actor = `legacy-add-${digest([entity, row])}`; state.clock[actor] = 1;
        put(state, entity, '$exists', true, actor, 1, row.updatedAt ?? 0); put(state, entity, '$order', index, actor, 1, row.updatedAt ?? 0);
      }
    }
  }
  for (const [id, at] of Object.entries(data.deleted)) for (const collection of COLLECTIONS) {
    const entity = keyOf(collection, id), registers = state.entities[entity];
    if (!registers?.$exists || registers.$exists.values.some(v => v.value === false) || data[collection]?.some(row => row.id === id)) continue;
    const actor = `legacy-delete-${digest([entity, at])}`, sequence = (state.clock[actor] ?? 0) + 1;
    state.clock[actor] = sequence; put(state, entity, '$exists', false, actor, sequence, at);
  }
  return state;
}
function put(state: CrdtState, entity: string, field: string, value: Json | undefined, actor: string, sequence: number, at: number, preserveAlternatives = false) {
  const previous = state.entities[entity]?.[field];
  // Editing the visible version is not implicit consent to discard unseen alternatives.
  // Only the dedicated conflict resolver acknowledges every alternative.
  const keep = preserveAlternatives && previous ? previous.values.filter(v => !same(v.value, preferred(previous, field))) : [];
  const stamp = keep.length ? Math.max(at, ...previous!.values.map(v => v.at + 1)) : at;
  // Causality is scoped to this register. Copying the entire vault clock into every
  // field would multiply metadata with every app restart and unrelated clinical edit.
  const seen = join(previous?.seen ?? {}, { [actor]: sequence });
  (state.entities[entity] ??= {})[field] = { seen, values: ordered([...keep, { actor, sequence, at: stamp, ...(value === undefined ? {} : { value: structuredClone(value) }) }]) };
}

export function recordChanges(before: VaultData, after: VaultData, at: number, actor: string = crypto.randomUUID()) {
  // A permanently erased recording cannot return through an older local snapshot.
  after.audioMemos = (after.audioMemos ?? []).filter(m => !Object.hasOwn(before.deleted, m.id));
  const state = stateOf(after.crdt && !same(before.crdt, after.crdt) ? after : before); const sequence = (state.clock[actor] ?? 0) + 1; state.clock[actor] = sequence;
  for (const collection of [...COLLECTIONS, 'settings'] as const) {
    const oldRows = collection === 'settings' ? [{ ...before.settings, id: 'settings' }] : (before[collection] ?? []) as unknown as Row[];
    const rows = collection === 'settings' ? [{ ...after.settings, id: 'settings' }] : (after[collection] ?? []) as unknown as Row[];
    const old = new Map(oldRows.map(row => [row.id, row]));
    rows.forEach((row, index) => {
      const prev = old.get(row.id), entity = keyOf(collection, row.id), nextFields = fields(row, collection), previous = prev ? fields(prev, collection) : {};
      let changed = !prev;
      for (const field of new Set([...Object.keys(previous), ...Object.keys(nextFields)])) if (!same(previous[field], nextFields[field])) { put(state, entity, field, nextFields[field], actor, sequence, at, true); changed = true; }
      if (!prev) put(state, entity, '$order', index, actor, sequence, at);
      if (changed) {
        put(state, entity, '$exists', true, actor, sequence, at);
        if (collection === 'settings') after.settings.updatedAt = at; else row.updatedAt = at;
        delete after.deleted[row.id];
      }
    });
    for (const row of oldRows) if (!rows.some(r => r.id === row.id)) { put(state, keyOf(collection, row.id), '$exists', false, actor, sequence, at); after.deleted[row.id] = at; }
  }
  after.crdt = state;
  scrubErasedClients(after);
  scrubDraftMemoReferences(after, erasedAudioMemoIds(after));
}

export function mergeStates(a: CrdtState, b: CrdtState): CrdtState {
  const result: CrdtState = { version: 1, clock: join(a.clock, b.clock), entities: {} };
  for (const entity of [...new Set([...Object.keys(a.entities), ...Object.keys(b.entities)])].sort()) {
    const af = a.entities[entity] ?? {}, bf = b.entities[entity] ?? {}, fields: Record<string, Register> = {};
    for (const field of [...new Set([...Object.keys(af), ...Object.keys(bf)])].sort()) fields[field] = af[field] && bf[field] ? mergeRegister(af[field], bf[field]) : structuredClone(af[field] ?? bf[field]);
    result.entities[entity] = fields;
  }
  return result;
}
export function materialize(base: VaultData, state: CrdtState): VaultData {
  const result = structuredClone(base); result.crdt = state;
  for (const collection of COLLECTIONS) (result[collection] as unknown[]) = [];
  for (const [entity, registers] of Object.entries(state.entities)) {
    const [collection, id] = JSON.parse(entity) as [Collection, string];
    // Deletion wins a concurrent edit. Explicitly choosing 'restore' is a new causal operation.
    if (registers.$exists?.values.some(v => v.value === false)) { if (collection !== 'settings') result.deleted[id] = Math.max(...registers.$exists.values.map(v => v.at)); continue; }
    const row: Row = { id, updatedAt: Math.max(0, ...Object.values(registers).flatMap(r => r.values.map(v => v.at))) };
    for (const [field, register] of Object.entries(registers)) {
      const value = preferred(register, field); if (value === undefined || field === '$exists' || field === '$order') continue;
      if (field === '$snapshot' || field === '$amount' || field === '$recording') Object.assign(row, structuredClone(value));
      else if (field.startsWith('practice.')) { row.practice ??= {}; (row.practice as Record<string, Json>)[field.slice(9)] = value; }
      else if (field.startsWith('tag:')) { if (value) (row.tags ??= [] as string[]); if (value) (row.tags as string[]).push(field.slice(4)); }
      else if (field.startsWith('memoLabel:')) { if (value) (row.memoLabels ??= [] as string[]); if (value) (row.memoLabels as string[]).push(field.slice(10)); }
      else if (field.startsWith('memoFavorite:')) { if (value) (row.memoLabelFavorites ??= [] as string[]); if (value) (row.memoLabelFavorites as string[]).push(field.slice(13)); }
      else if (field.startsWith('marketingConsent:')) { row.marketingConsent ??= {}; (row.marketingConsent as Record<string, Json>)[field.slice(17)] = structuredClone(value); }
      else if (/^(deliveries|returns|telegramDeliveries|statusHistory|shares|messages|recipients):/.test(field)) { const list = field.split(':')[0]; (row[list] ??= [] as Json[]); (row[list] as Json[]).push(structuredClone(value)); }
      else row[field] = structuredClone(value);
    }
    if (collection === 'settings') {
      if (base.settings.memoLabels || Object.keys(registers).some(field => field.startsWith('memoLabel:'))) row.memoLabels ??= [];
      if (base.settings.memoLabelFavorites || Object.keys(registers).some(field => field.startsWith('memoFavorite:'))) row.memoLabelFavorites ??= [];
      delete (row as Partial<Row>).id; result.settings = { ...result.settings, ...row, autoSync: base.settings.autoSync } as VaultData['settings'];
    }
    else {
      if (['sessions', 'notes'].includes(collection)) row.tags ??= [];
      if (collection === 'clients' && Object.keys(registers).some(field => field.startsWith('statusHistory:'))) row.statusHistory ??= [];
      if (collection === 'documents') { row.deliveries ??= []; row.returns ??= []; }
      if (collection === 'newsletters') { row.messages ??= []; row.recipients ??= []; }
      if (collection === 'documents') for (const field of ['deliveries', 'returns', 'telegramDeliveries']) {
        const entries = row[field] as { id: string; requestedAt?: string; uploadedAt?: string }[] | undefined;
        entries?.sort((a, b) => (a.requestedAt ?? a.uploadedAt ?? '').localeCompare(b.requestedAt ?? b.uploadedAt ?? '', 'en') || a.id.localeCompare(b.id, 'en'));
      }
      (result[collection] as unknown as Row[]).push(row); delete result.deleted[id];
    }
  }
  for (const collection of COLLECTIONS) (result[collection] as unknown as Row[]).sort((a, b) => Number(preferred(state.entities[keyOf(collection, a.id)].$order) ?? 0) - Number(preferred(state.entities[keyOf(collection, b.id)].$order) ?? 0) || a.id.localeCompare(b.id, 'en'));
  scrubErasedClients(result);
  scrubDraftMemoReferences(result, erasedAudioMemoIds(result));
  result.sessionDrafts = (result.sessionDrafts ?? []).filter(d => !Object.hasOwn(result.deleted, d.id) && (!d.originalSessionId || !Object.hasOwn(result.deleted, d.originalSessionId)));
  return result;
}
/** Erasure must not leave a hidden copy of an erased client's record in conflict metadata. */
function scrubErasedClients(data: VaultData) {
  const state = data.crdt; if (!state) return;
  const erased = new Set(Object.entries(state.entities).filter(([key, fields]) => (JSON.parse(key) as string[])[0] === 'clients' && fields.$exists?.values.some(v => v.value === false)).map(([key]) => (JSON.parse(key) as string[])[1]));
  const erasedSessions = new Set(Object.entries(state.entities).filter(([key, fields]) => (JSON.parse(key) as string[])[0] === 'sessions' && fields.$exists?.values.some(v => v.value === false)).map(([key]) => (JSON.parse(key) as string[])[1]));
  const erasedReferrals = new Set(Object.entries(state.entities).filter(([key, fields]) => (JSON.parse(key) as string[])[0] === 'referrals' && (fields.$exists?.values.some(v => v.value === false) || fields.$snapshot?.values.some(v => v.value && typeof v.value === 'object' && !Array.isArray(v.value) && ['referrerId','referredId'].some(k => erased.has(String((v.value as Record<string, Json>)[k])))))) .map(([key]) => (JSON.parse(key) as string[])[1]));
  data.referralCodes = (data.referralCodes ?? []).filter(c => !erased.has(c.clientId));
  data.referrals = (data.referrals ?? []).filter(r => !erased.has(r.referrerId) && !erased.has(r.referredId) && !erasedReferrals.has(r.id));
  data.referralPayouts = (data.referralPayouts ?? []).filter(p => !erased.has(p.referrerId)).map(p => ({ ...p, allocations: p.allocations.filter(a => !erasedReferrals.has(a.referralId)) }));
  for (const [key, fields] of Object.entries(state.entities)) if ((JSON.parse(key) as string[])[0] === 'referralPayouts') for (const v of fields.$snapshot?.values ?? []) {
    if (v.value && typeof v.value === 'object' && !Array.isArray(v.value) && Array.isArray(v.value.allocations)) v.value.allocations = v.value.allocations.filter(a => !a || typeof a !== 'object' || Array.isArray(a) || !erasedReferrals.has(String(a.referralId)));
  }
  for (const newsletter of data.newsletters ?? []) newsletter.recipients = newsletter.recipients.filter(r => !erased.has(r.clientId));
  for (const [entity, fields] of Object.entries(state.entities)) {
    const [collection, id] = JSON.parse(entity) as [Collection, string];
    if (collection === 'settings') continue;
    if (collection === 'newsletters') for (const [field, register] of Object.entries(fields)) if (field.startsWith('recipients:')) {
      register.values = register.values.filter(v => !v.value || typeof v.value !== 'object' || Array.isArray(v.value) || typeof v.value.clientId !== 'string' || !erased.has(v.value.clientId));
      if (!register.values.length) delete fields[field];
    }
    const owner = fields.clientId?.values.some(v => typeof v.value === 'string' && erased.has(v.value)) || fields.$snapshot?.values.some(v => v.value && typeof v.value === 'object' && !Array.isArray(v.value) && ['clientId', 'referrerId', 'referredId'].some(key => typeof (v.value as Record<string, Json>)[key] === 'string' && erased.has((v.value as Record<string, string>)[key])));
    const permanentlyDeleted = fields.$exists?.values.every(v => v.value === false);
    const erasedDraft = collection === 'sessionDrafts' && fields.originalSessionId?.values.some(v => typeof v.value === 'string' && erasedSessions.has(v.value));
    const erasedMemo = collection === 'audioMemos' && (fields.$exists?.values.some(v => v.value === false) || fields.sessionId?.values.some(v => typeof v.value === 'string' && erasedSessions.has(v.value)));
    if (collection === 'clients' && erased.has(id) || owner || permanentlyDeleted || erasedMemo || erasedDraft) {
      const deletedAt = Math.max(0, ...Object.values(fields).flatMap(r => r.values.map(v => v.at)));
      const deletion = fields.$exists?.values.find(v => v.value === false) ?? { actor: 'erasure', sequence: 1, at: deletedAt, value: false };
      state.entities[entity] = { $exists: { seen: join(state.clock, { [deletion.actor]: deletion.sequence }), values: [{ ...deletion, value: false }] } };
      data.deleted[id] = deletedAt;
      if (collection === 'audioMemos') data.audioMemos = (data.audioMemos ?? []).filter(m => m.id !== id);
    }
  }
}
/** Also erase a recording from every unfinished and conflicting draft variant. */
function scrubDraftMemoReferences(data: VaultData, ids: ReadonlySet<string>) {
  const clean = (value: unknown) => {
    const payload = value as VaultData['sessionDrafts'][number]['payload'];
    if (!payload || !Array.isArray(payload.memos)) return;
    payload.memos = payload.memos.filter(m => !ids.has(m.id));
    if (payload.editedMemos) for (const id of ids) delete payload.editedMemos[id];
  };
  for (const draft of data.sessionDrafts ?? []) clean(draft.payload);
  for (const [entity, fields] of Object.entries(data.crdt?.entities ?? {})) if ((JSON.parse(entity) as string[])[0] === 'sessionDrafts') for (const version of fields.payload?.values ?? []) clean(version.value);
}
/** IDs whose audio is irrevocably erased; used to scrub local encrypted recovery points. */
export function erasedAudioMemoIds(data: VaultData): Set<string> {
  return new Set(Object.entries(data.crdt?.entities ?? {}).filter(([key, fields]) => (JSON.parse(key) as string[])[0] === 'audioMemos' && fields.$exists?.values.some(v => v.value === false)).map(([key]) => (JSON.parse(key) as string[])[1]));
}
export function redactAudioMemos(data: VaultData, ids: ReadonlySet<string>, at = Date.now()) {
  const state = stateOf(data);
  for (const id of ids) {
    const actor = `memo-erasure-${id}`, sequence = (state.clock[actor] ?? 0) + 1; state.clock[actor] = sequence;
    put(state, keyOf('audioMemos', id), '$exists', false, actor, sequence, at); data.deleted[id] = at;
  }
  data.audioMemos = (data.audioMemos ?? []).filter(m => !ids.has(m.id)); data.crdt = state; scrubDraftMemoReferences(data, ids); scrubErasedClients(data);
}
export function erasedDraftIds(data: VaultData): Set<string> {
  return new Set(Object.entries(data.crdt?.entities ?? {}).filter(([key, fields]) => (JSON.parse(key) as string[])[0] === 'sessionDrafts' && fields.$exists?.values.some(v => v.value === false)).map(([key]) => (JSON.parse(key) as string[])[1]));
}
export function redactSessionDrafts(data: VaultData, ids: ReadonlySet<string>, at = Date.now()) {
  const state = stateOf(data);
  for (const id of ids) {
    const actor = `draft-erasure-${id}`, sequence = (state.clock[actor] ?? 0) + 1; state.clock[actor] = sequence;
    put(state, keyOf('sessionDrafts', id), '$exists', false, actor, sequence, at); data.deleted[id] = at;
  }
  data.sessionDrafts = (data.sessionDrafts ?? []).filter(d => !ids.has(d.id)); data.crdt = state; scrubErasedClients(data);
}
const conflictCache = new WeakMap<CrdtState, SyncConflict[]>();
export function syncConflicts(data: VaultData): SyncConflict[] {
  if (!data.crdt) return [];
  const cached = conflictCache.get(data.crdt); if (cached) return cached;
  const result = Object.entries(data.crdt.entities).flatMap(([entity, fields]) => Object.entries(fields).flatMap(([field, register]) => {
    if (field === '$order' || register.values.length < 2) return [];
    // first-payment dates form a monotone minimum; their join needs no manual choice.
    if (field === 'firstPaidOn' && (JSON.parse(entity) as string[])[0] === 'referrals') return [];
    let variants = register.values.filter((v, i, all) => all.findIndex(w => same(v.value, w.value)) === i);
    if (/^(deliveries|telegramDeliveries):/.test(field)) {
      const identity = (v: Version) => v.value && typeof v.value === 'object' && !Array.isArray(v.value) ? Object.fromEntries(Object.entries(v.value).filter(([k]) => !['acceptedAt', 'providerId', 'messageId'].includes(k))) : v.value;
      variants = variants.filter(v => !(v.value && typeof v.value === 'object' && !Array.isArray(v.value) && !v.value.acceptedAt && variants.some(w => w.value && typeof w.value === 'object' && !Array.isArray(w.value) && w.value.acceptedAt && same(identity(v), identity(w)))));
    }
    const [collection, id] = JSON.parse(entity) as [Collection, string];
    return variants.length > 1 ? [{ entity, collection, id, field, variants }] : [];
  }));
  conflictCache.set(data.crdt, result); return result;
}
/** Resolution acknowledges every current alternative, so merging an old device cannot revive it. */
export function resolveConflict(data: VaultData, conflict: SyncConflict, chosen: Version, text?: string) {
  const value = text ?? chosen.value;
  if (conflict.collection === 'audioMemos' && typeof value === 'string' &&
    (conflict.field === 'summary' && value.length > MEMO_MAX_SUMMARY || conflict.field === 'label' && value.length > MEMO_MAX_LABEL)) throw new Error('memoTextLimit');
  const state = stateOf(data); const actor = crypto.randomUUID(), sequence = 1; state.clock[actor] = sequence;
  put(state, conflict.entity, conflict.field, value, actor, sequence, Date.now());
  Object.assign(data, materialize(data, state));
}

export function conflictBlobIds(data: VaultData): string[] {
  const ids = new Set<string>();
  const walk = (value: unknown, field = '') => {
    if ((field === 'blobId' || field === 'avatarId') && typeof value === 'string') ids.add(value);
    else if (Array.isArray(value)) value.forEach(v => walk(v));
    else if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) walk(v, key);
  };
  const liveClients = new Set(data.clients.map(c => c.id));
  for (const [entity, fields] of Object.entries(data.crdt?.entities ?? {})) {
    const [collection, id] = JSON.parse(entity) as [Collection, string];
    if (collection === 'settings') continue;
    if (collection === 'clients' && !liveClients.has(id)) continue;
    if (fields.clientId?.values.some(v => typeof v.value === 'string' && !liveClients.has(v.value))) continue;
    const visible = data[collection]?.some(r => r.id === id);
    if (!visible && !(fields.$exists?.values.some(v => v.value === true) && fields.$exists.values.some(v => v.value === false))) continue;
    for (const [field, register] of Object.entries(fields)) for (const version of register.values) walk(version.value, field);
  }
  return [...ids];
}
