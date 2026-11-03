import type { Language, Stamped } from './types';

export const HOMEWORK_CATEGORIES = ['feelings', 'calm', 'resources', 'routine', 'relationships', 'goals'] as const;
export type HomeworkCategory = typeof HOMEWORK_CATEGORIES[number];
export type HomeworkStatus = 'open' | 'deferred' | 'discussed' | 'ended';
export interface HomeworkContent { title: string; goal: string; steps: string; rhythm: string; questions: string[] }
/** Stable template ID; changing a reusable template creates a new content version. */
export interface HomeworkTemplate extends Stamped {
  id: string; createdAt: string; archived?: boolean;
  snapshot: { version: string; category: HomeworkCategory; content: Partial<Record<Language, HomeworkContent>> };
}
export interface HomeworkSnapshot {
  templateId: string; version: string; category: HomeworkCategory; language: Language; content: HomeworkContent;
  pdfClientName?: string;
  /** A legacy free-text task has no inferred assignment or delivery date. */
  legacySessionId?: string;
}
/** Session forms keep selections in their existing encrypted draft until saved. */
export interface HomeworkSelection {
  id: string; snapshot: HomeworkSnapshot; dueOn?: string; returnExpected: boolean; repeatConfirmed?: boolean; acknowledgedAssignmentIds?: string[];
}
export interface HomeworkHandover {
  id: string; on: string; recordedAt: string; channel: 'personal' | 'externalEmail' | 'externalTelegram' | 'other';
}
export interface HomeworkAssignment extends Stamped {
  id: string; clientId: string; sessionId?: string; snapshot: HomeworkSnapshot;
  assignedAt?: string; recordedAt?: string; dueOn?: string; returnExpected: boolean;
  state: { value: HomeworkStatus; at?: string };
  feedback: string; handovers: HomeworkHandover[]; repeatAcknowledgedAt?: string;
}

function fail(): never { throw new Error('invalidBackup'); }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number, required = false): v is string => typeof v === 'string' && v.length <= max && (!required || !!v.trim());
export const homeworkDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const timestamp = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function validHomeworkContent(v: unknown): v is HomeworkContent {
  return object(v) && text(v.title,160,true) && text(v.goal,2000) && text(v.steps,8000,true) && text(v.rhythm,1000) && Array.isArray(v.questions) && v.questions.length <= 6 && v.questions.every(q => text(q,400,true));
}
export function validHomeworkSnapshot(v: unknown): v is HomeworkSnapshot {
  return object(v) && text(v.templateId,200,true) && text(v.version,200,true) && HOMEWORK_CATEGORIES.includes(v.category as HomeworkCategory) && ['de','uk'].includes(String(v.language)) && validHomeworkContent(v.content) && (v.pdfClientName === undefined || text(v.pdfClientName,160)) && (v.legacySessionId === undefined || text(v.legacySessionId,200,true));
}
export function validateHomeworkSelection(v: unknown): asserts v is HomeworkSelection {
  if (!object(v) || !text(v.id,240,true) || !validHomeworkSnapshot(v.snapshot) || typeof v.returnExpected !== 'boolean' || v.dueOn !== undefined && !homeworkDay(v.dueOn) || v.repeatConfirmed !== undefined && typeof v.repeatConfirmed !== 'boolean' || v.acknowledgedAssignmentIds !== undefined && (!Array.isArray(v.acknowledgedAssignmentIds) || v.acknowledgedAssignmentIds.some(id => !text(id,240,true)))) fail();
}
/** Validate only this extension; missing collections remain compatible with old vaults. */
export function normalizeHomeworkRecords(templates: unknown = [], assignments: unknown = []): { homeworkTemplates: HomeworkTemplate[]; homeworkAssignments: HomeworkAssignment[] } {
  if (!Array.isArray(templates) || templates.length > 2000 || !Array.isArray(assignments) || assignments.length > 50000) fail();
  const ids = new Set<string>();
  for (const t of templates) {
    if (!object(t) || !text(t.id,200,true) || ids.has(t.id) || !timestamp(t.createdAt) || t.archived !== undefined && typeof t.archived !== 'boolean' || !object(t.snapshot)) fail();
    ids.add(t.id);
    const snapshot = t.snapshot as Record<string, unknown>;
    if (!text(snapshot.version,200,true) || !HOMEWORK_CATEGORIES.includes(snapshot.category as HomeworkCategory) || !object(snapshot.content) || !Object.keys(snapshot.content).length || Object.entries(snapshot.content).some(([key,value]) => !['de','uk'].includes(key) || !validHomeworkContent(value))) fail();
  }
  ids.clear();
  for (const a of assignments) {
    if (!object(a) || !text(a.id,240,true) || ids.has(a.id) || !text(a.clientId,200,true) || !validHomeworkSnapshot(a.snapshot) || !text(a.feedback,4000) || typeof a.returnExpected !== 'boolean' || !object(a.state) || !['open','deferred','discussed','ended'].includes(String(a.state.value)) || a.state.at !== undefined && !timestamp(a.state.at) || !Array.isArray(a.handovers)) fail();
    ids.add(a.id);
    for (const key of ['assignedAt','recordedAt','repeatAcknowledgedAt']) if (a[key] !== undefined && !timestamp(a[key])) fail();
    if (a.dueOn !== undefined && !homeworkDay(a.dueOn) || a.sessionId !== undefined && !text(a.sessionId,200,true)) fail();
    const events = new Set<string>();
    for (const event of a.handovers as unknown[]) {
      if (!object(event) || !text(event.id,200,true) || events.has(event.id) || !homeworkDay(event.on) || !timestamp(event.recordedAt) || !['personal','externalEmail','externalTelegram','other'].includes(String(event.channel))) fail();
      events.add(event.id);
    }
  }
  return { homeworkTemplates: structuredClone(templates) as HomeworkTemplate[], homeworkAssignments: structuredClone(assignments) as HomeworkAssignment[] };
}
