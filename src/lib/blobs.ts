import type { VaultData } from './types';
/** Every encrypted image the vault points at (avatars and photo notes). */
export function referencedBlobs(data: VaultData) {
  return [...new Set([...data.clients.flatMap(c => c.avatarId ? [c.avatarId] : []), ...data.notes.map(n => n.blobId)])];
}
