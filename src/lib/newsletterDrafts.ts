import type { NewsletterDraft, NewsletterDraftPayload, VaultData } from './types';

export const hasNewsletterDraftContent = (payload: NewsletterDraftPayload) => !!(payload.title.trim() || payload.titleUk.trim() || payload.content.trim() || payload.contentUk.trim() || payload.image || payload.clientIds.length);
export function saveNewsletterDraft(data: VaultData, draft: NewsletterDraft) {
  if (Object.hasOwn(data.deleted, draft.id)) throw new Error('newsletterDraftDeleted');
  if (draft.payload.title.length > 180 || draft.payload.titleUk.length > 180 || draft.payload.content.length > 20000 || draft.payload.contentUk.length > 20000 || !['email', 'telegram', 'both', 'none'].includes(draft.payload.channel)) throw new Error('required');
  const clients = new Set(data.clients.map(c => c.id));
  const clean = structuredClone(draft); clean.payload.clientIds = [...new Set(clean.payload.clientIds)].filter(id => clients.has(id));
  data.newsletterDrafts ??= [];
  const index = data.newsletterDrafts.findIndex(d => d.id === draft.id);
  if (!hasNewsletterDraftContent(clean.payload)) { if (index >= 0) data.newsletterDrafts.splice(index, 1); return; }
  if (index < 0) data.newsletterDrafts.push(clean); else data.newsletterDrafts[index] = clean;
}
export function deleteNewsletterDraft(data: VaultData, id: string) { data.newsletterDrafts = (data.newsletterDrafts ?? []).filter(d => d.id !== id); }
