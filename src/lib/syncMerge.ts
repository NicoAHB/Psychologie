import { decryptVault } from './crypto';
import { currentUser, fetchRemote, remoteEnvelope } from './cloud';
import { mergeEnvelopes, mergeVaults } from './merge';
import type { VaultData, VaultEnvelope } from './types';

/**
 * The cloud holds a newer revision than this device knew. Fetch it, decrypt it with the same data key and fold it into
 * the local copy. The caller stores the result and then syncs again with `revision` as the expected revision.
 */
export async function fetchMerged(key: CryptoKey, data: VaultData, envelope: VaultEnvelope) {
  const [remote, user] = await Promise.all([fetchRemote(), currentUser()]);
  if (!remote) throw new Error('noRemote');
  if (remote.vault_id !== envelope.vaultId) throw new Error('differentVault');
  const remoteEnvelopeValue = remoteEnvelope(remote);
  const remoteData = await decryptVault(key, remoteEnvelopeValue);
  return { data: mergeVaults(data, remoteData), envelope: mergeEnvelopes(envelope, remoteEnvelopeValue), revision: remote.revision, userId: user.id, vaultId: remote.vault_id };
}
