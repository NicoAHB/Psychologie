import { getCloud } from './cloud';
import { validReferralCode } from './referrals';
import type { ReferralCode } from './types';

export async function issueReferralCode(vaultId: string, clientId: string): Promise<ReferralCode> {
  const cloud = await getCloud(); if (!cloud) throw new Error('referralSetup');
  const subject = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${vaultId}:${clientId}`))), b => b.toString(16).padStart(2,'0')).join('');
  const { data, error } = await cloud.rpc('issue_referral_code', { p_vault_id: vaultId, p_subject_hash: subject });
  if (error || !data || typeof data.id !== 'string' || !validReferralCode(data.code) || typeof data.created_at !== 'string') throw new Error('referralSetup');
  return { id: data.id, clientId, code: data.code, createdAt: data.created_at };
}
export async function revokeReferralCode(vaultId: string, id: string) {
  const cloud = await getCloud(); if (!cloud) throw new Error('referralSetup');
  const { error } = await cloud.rpc('revoke_referral_code', { p_vault_id: vaultId, p_id: id }); if (error) throw new Error('referralSetup');
}
