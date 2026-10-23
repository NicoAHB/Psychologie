/** No secrets are collected here; this is an explicit user acknowledgement, not a recovery guarantee. */
export function backupSecretsConfirmed(hasRecoveryKey:boolean,passphraseWritten:boolean,recoveryWritten:boolean) {
  return hasRecoveryKey && passphraseWritten && recoveryWritten;
}
export function backupGuideReady(secretsConfirmed:boolean,copyCreated:boolean,copyVerified:boolean) {
  return secretsConfirmed && copyCreated && copyVerified;
}
