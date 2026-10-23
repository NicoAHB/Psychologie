import type { SessionDraft, VaultData } from './types';
export function saveSessionDraft(data: VaultData, draft: SessionDraft) {
  if (!data.clients.some(c => c.id === draft.clientId) || draft.originalSessionId && !data.sessions.some(s => s.id === draft.originalSessionId) || Object.hasOwn(data.deleted, draft.id)) throw new Error('storageError');
  data.sessionDrafts ??= [];
  const index = data.sessionDrafts.findIndex(d => d.id === draft.id);
  if (index < 0) data.sessionDrafts.push(structuredClone(draft)); else data.sessionDrafts[index] = structuredClone(draft);
}
export const deleteSessionDraft = (data: VaultData, id: string) => { data.sessionDrafts = (data.sessionDrafts ?? []).filter(d => d.id !== id); };
