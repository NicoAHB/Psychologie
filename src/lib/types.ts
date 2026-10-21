export type Language = 'de' | 'uk';
export type Route = 'overview' | 'clients' | 'appointments' | 'finances' | 'settings';
// `updatedAt` (epoch ms) is stamped centrally on every change; it drives merging of two devices and is absent on legacy records.
export interface Stamped { updatedAt?: number }
export interface Client extends Stamped {
  id: string; name: string; createdAt: string; language: Language; preparation: string;
  contact: string; telegramChatId: string; reminderConsent: boolean; avatarId?: string;
  /** Postal address for invoices. */
  address?: string;
  /** Where the client lives (IANA name). Appointment times are always shown in this zone as well. */
  timeZone?: string;
}
export interface Appointment extends Stamped {
  id: string; clientId: string; date: string; time: string; duration: number;
  feeCents: number;
  /** Zone in which `date` and `time` were agreed; the exact instant is derived from it. */
  timeZone: string; reminderId: string; status: 'scheduled' | 'completed' | 'cancelled';
  seriesId?: string;
}
export interface Session extends Stamped {
  id: string; clientId: string; date: string; time: string; feeCents: number;
  paidAt: string | null; notes: string; tags: string[]; appointmentId?: string;
  invoiceId?: string;
}
export interface PhotoNote extends Stamped {
  id: string; clientId: string; blobId: string; createdAt: string; tags: string[]; caption: string;
}
export interface InvoiceLine { sessionId: string; date: string; description: string; amountCents: number }
export interface Invoice extends Stamped {
  id: string; number: string; clientId: string; issuedAt: string; lines: InvoiceLine[]; totalCents: number;
  /** Snapshots: later edits of the client or practice profile never alter an issued invoice. */
  recipient: { name: string; address: string }; sender: PracticeProfile; language: Language;
}
export type AssessmentKind = 'phq9' | 'gad7';
export interface Assessment extends Stamped {
  id: string; clientId: string; kind: AssessmentKind; date: string; answers: number[]; note: string;
}
export interface Template extends Stamped { id: string; name: string; body: string }
export interface PracticeProfile {
  name: string; address: string; taxId: string; iban: string; bank: string; taxNote: string; invoicePrefix: string; serviceName: string;
}
export interface Settings {
  timeZone: string; advisorChatId: string; autoSync: boolean; remindersEnabled: boolean;
  practice: PracticeProfile; updatedAt?: number;
}
export interface VaultData {
  schema: 1; clients: Client[]; appointments: Appointment[]; sessions: Session[]; notes: PhotoNote[];
  invoices: Invoice[]; assessments: Assessment[]; templates: Template[];
  /** id -> deletion time, so a deletion on one device is not undone by merging another device. */
  deleted: Record<string, number>;
  settings: Settings;
}
export interface Ciphertext { iv: string; ciphertext: string }
/** One way to unlock: the data key wrapped under a key derived from a passphrase, recovery key or passkey secret. */
export interface KeyWrap extends Ciphertext { at?: number }
export interface PasskeyWrap extends KeyWrap { credentialId: string; prfSalt: string; label: string }
export interface Wraps { passphrase: KeyWrap; recovery?: KeyWrap; passkeys?: PasskeyWrap[]; /** Credential ids removed on purpose, so merging a stale copy cannot bring a lost device's passkey back. */ removedPasskeys?: string[] }
export interface VaultEnvelope {
  /** v1: the passphrase-derived key encrypts the data directly. v2: a random data key is wrapped per unlock method. */
  format: 'praxisraum-v1' | 'praxisraum-v2'; vaultId: string; salt: string; iterations: 600000; payload: Ciphertext;
  wraps?: Wraps;
}
export interface EncryptedBlob { id: string; vaultId: string; payload: Ciphertext }
export interface RemoteVault { vault_id: string; salt: string; payload: Ciphertext & { wraps?: Wraps }; revision: number }
export const emptyPractice = (): PracticeProfile => ({ name: '', address: '', taxId: '', iban: '', bank: '', taxNote: '', invoicePrefix: '', serviceName: '' });
export const emptyVault = (): VaultData => ({
  schema: 1, clients: [], appointments: [], sessions: [], notes: [], invoices: [], assessments: [], templates: [], deleted: {},
  settings: { timeZone: 'Europe/Berlin', advisorChatId: '', autoSync: false, remindersEnabled: false, practice: emptyPractice() },
});
/** Fill fields that vaults written by earlier versions lack. */
export function normalizeVault(value: VaultData): VaultData {
  const base = emptyVault();
  return { ...base, ...value, invoices: value.invoices ?? [], assessments: value.assessments ?? [], templates: value.templates ?? [], deleted: value.deleted ?? {},
    settings: { ...base.settings, ...value.settings, practice: { ...base.settings.practice, ...value.settings?.practice } } };
}
export const uid = () => crypto.randomUUID();
