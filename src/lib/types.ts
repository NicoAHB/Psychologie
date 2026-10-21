export type Language = 'de' | 'uk';
export type Route = 'overview' | 'clients' | 'appointments' | 'finances' | 'settings';
export interface Client {
  id: string; name: string; createdAt: string; language: Language; preparation: string;
  contact: string; telegramChatId: string; reminderConsent: boolean; avatarId?: string;
}
export interface Appointment {
  id: string; clientId: string; date: string; time: string; duration: number;
  feeCents: number; timeZone: string; reminderId: string; status: 'scheduled' | 'completed' | 'cancelled';
}
export interface Session {
  id: string; clientId: string; date: string; time: string; feeCents: number;
  paidAt: string | null; notes: string; tags: string[]; appointmentId?: string;
}
export interface PhotoNote {
  id: string; clientId: string; blobId: string; createdAt: string; tags: string[]; caption: string;
}
export interface VaultData {
  schema: 1; clients: Client[]; appointments: Appointment[]; sessions: Session[]; notes: PhotoNote[];
  settings: { timeZone: string; advisorChatId: string; autoSync: boolean; remindersEnabled: boolean };
}
export interface Ciphertext { iv: string; ciphertext: string }
export interface VaultEnvelope {
  format: 'praxisraum-v1'; vaultId: string; salt: string; iterations: 600000; payload: Ciphertext;
}
export interface EncryptedBlob { id: string; vaultId: string; payload: Ciphertext }
export interface RemoteVault { vault_id: string; salt: string; payload: Ciphertext; revision: number }
export const emptyVault = (): VaultData => ({
  schema: 1, clients: [], appointments: [], sessions: [], notes: [],
  settings: { timeZone: 'Europe/Berlin', advisorChatId: '', autoSync: false, remindersEnabled: false },
});
export const uid = () => crypto.randomUUID();
