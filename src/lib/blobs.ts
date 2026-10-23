import { conflictBlobIds } from './crdt';
import type { VaultData } from './types';
/** Every encrypted file the vault points at, including documents and all returned versions. */
export function referencedBlobs(data: VaultData) {
  return [...new Set([...conflictBlobIds(data), ...(data.sessionDrafts ?? []).flatMap(d => [...d.payload.photos.map(p => p.blobId), ...d.payload.memos.map(m => m.blobId)]), ...data.clients.flatMap(c => c.avatarId ? [c.avatarId] : []), ...data.notes.map(n => n.blobId), ...(data.audioMemos ?? []).map(m => m.blobId), ...(data.documents ?? []).flatMap(d => [d.file.blobId, ...d.returns.map(r => r.file.blobId)])])];
}
