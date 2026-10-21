import type { VaultData } from './types';
/** Every encrypted file the vault points at, including documents and all returned versions. */
export function referencedBlobs(data: VaultData) {
  return [...new Set([...data.clients.flatMap(c => c.avatarId ? [c.avatarId] : []), ...data.notes.map(n => n.blobId), ...(data.documents ?? []).flatMap(d => [d.file.blobId, ...d.returns.map(r => r.file.blobId)])])];
}
