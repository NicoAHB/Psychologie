export type Language = 'de' | 'uk';
export type Currency = 'EUR' | 'UAH';
/** Hrywnja per euro, stored with six decimal places as an integer. Never a patient-data request. */
export interface ExchangeRate { micros: number; date: string; source: 'nbu' | 'manual' }
export interface Billing {
  currency: Currency; amountCents: number; rate?: ExchangeRate;
  /** EUR comparison value is kept in the parent record's feeCents. */
}
export interface BankAccount { holder: string; iban: string; bank: string; bic: string }
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
  currency?: Currency;
  email?: string;
}
export interface Appointment extends Stamped {
  id: string; clientId: string; date: string; time: string; duration: number;
  feeCents: number;
  billing?: Billing; originalFeeCents?: number;
  /** Zone in which `date` and `time` were agreed; the exact instant is derived from it. */
  timeZone: string; reminderId: string; status: 'scheduled' | 'completed' | 'cancelled';
  seriesId?: string;
}
export interface Session extends Stamped {
  id: string; clientId: string; date: string; time: string; feeCents: number;
  paidAt: string | null; notes: string; tags: string[]; appointmentId?: string;
  invoiceId?: string;
  billing?: Billing; originalFeeCents?: number;
  /** What the client was asked to do or observe until the next session, and whether it was reviewed. */
  homework?: string; homeworkDone?: boolean;
}
export interface PhotoNote extends Stamped {
  id: string; clientId: string; blobId: string; createdAt: string; tags: string[]; caption: string;
  /** Set when the photo (e.g. a handwritten note sheet) belongs to a session. */
  sessionId?: string;
}
export interface InvoiceLine { sessionId: string; date: string; description: string; amountCents: number; euroCents?: number; rate?: ExchangeRate }
export interface Invoice extends Stamped {
  id: string; number: string; clientId: string; issuedAt: string; lines: InvoiceLine[]; totalCents: number;
  /** Snapshots: later edits of the client or practice profile never alter an issued invoice. */
  recipient: { name: string; address: string }; sender: PracticeProfile; language: Language;
  currency?: Currency; totalEuroCents?: number; paymentAccount?: BankAccount;
  /** Retained inside the encrypted vault when a previous cent-valued invoice is rounded. */
  originalAmounts?: { totalCents: number; lines: { sessionId: string; amountCents: number }[] };
}
export type AssessmentKind = 'phq9' | 'gad7';
export interface DocumentFile { blobId: string; fileName: string; mimeType: string; size: number }
export interface EmailDelivery {
  id: string; recipient: string; requestedAt: string; subject: string; body: string;
  acceptedAt?: string; providerId?: string;
}
export interface DocumentReturn { id: string; file: DocumentFile; receivedOn: string; uploadedAt: string }
export interface ClientDocument extends Stamped {
  id: string; clientId: string; title: string; file: DocumentFile; createdAt: string;
  kind?: AssessmentKind; language?: Language; returnExpected: boolean;
  deliveries: EmailDelivery[]; returns: DocumentReturn[];
}
export interface Assessment extends Stamped {
  id: string; clientId: string; kind: AssessmentKind; date: string; answers: number[]; note: string;
}
export interface Template extends Stamped { id: string; name: string; body: string }
export interface PracticeProfile {
  name: string; address: string; taxId: string; iban: string; bank: string; taxNote: string; invoicePrefix: string; serviceName: string;
  accountHolder?: string; bic?: string; ibanUa?: string; bankUa?: string; accountHolderUa?: string; bicUa?: string;
}
export interface Settings {
  timeZone: string; advisorChatId: string; autoSync: boolean; remindersEnabled: boolean;
  practice: PracticeProfile; updatedAt?: number;
  exchangeRate?: ExchangeRate;
}
export interface VaultData {
  schema: 1; clients: Client[]; appointments: Appointment[]; sessions: Session[]; notes: PhotoNote[];
  invoices: Invoice[]; assessments: Assessment[]; templates: Template[]; documents: ClientDocument[];
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
export const emptyPractice = (): PracticeProfile => ({ name: '', address: '', taxId: '', iban: '', bank: '', taxNote: '', invoicePrefix: '', serviceName: '', accountHolder: '', bic: '', ibanUa: '', bankUa: '', accountHolderUa: '', bicUa: '' });
export const emptyVault = (): VaultData => ({
  schema: 1, clients: [], appointments: [], sessions: [], notes: [], invoices: [], assessments: [], templates: [], documents: [], deleted: {},
  settings: { timeZone: 'Europe/Berlin', advisorChatId: '', autoSync: false, remindersEnabled: false, practice: emptyPractice() },
});
/** Fill fields that vaults written by earlier versions lack. */
export function normalizeVault(value: VaultData, wholeAmounts = true): VaultData {
  const base = emptyVault();
  const result = { ...base, ...value, sessions: value.sessions.map(record => ({ ...record, ...(record.billing && { billing: { ...record.billing } }) })), appointments: value.appointments.map(record => ({ ...record, ...(record.billing && { billing: { ...record.billing } }) })), invoices: (value.invoices ?? []).map(invoice => ({ ...invoice })), assessments: value.assessments ?? [], templates: value.templates ?? [], deleted: value.deleted ?? {},
    documents: value.documents ?? [], settings: { ...base.settings, ...value.settings, practice: { ...base.settings.practice, ...value.settings?.practice } } };
  if (!wholeAmounts) return result;
  // User-requested whole-unit migration. It is deterministic and does not rewrite history timestamps.
  // Keep the original values, including each invoice line, so the adjustment remains traceable.
  const round = (cents: number) => Math.round(cents / 100) * 100;
  for (const record of [...result.sessions, ...result.appointments]) {
    if (record.feeCents % 100) { record.originalFeeCents ??= record.feeCents; record.feeCents = round(record.feeCents); }
    if (record.billing && record.billing.amountCents % 100) record.billing.amountCents = round(record.billing.amountCents);
  }
  for (const invoice of result.invoices) {
    if (invoice.totalCents % 100 || invoice.lines.some(line => line.amountCents % 100)) {
      invoice.originalAmounts ??= { totalCents: invoice.totalCents, lines: invoice.lines.map(line => ({ sessionId: line.sessionId, amountCents: line.amountCents })) };
      invoice.lines = invoice.lines.map(line => ({ ...line, amountCents: round(line.amountCents), ...(line.euroCents === undefined ? {} : { euroCents: round(line.euroCents) }) }));
      invoice.totalCents = invoice.lines.reduce((total, line) => total + line.amountCents, 0);
      if (invoice.totalEuroCents !== undefined) invoice.totalEuroCents = round(invoice.totalEuroCents);
    }
  }
  return result;
}
export const uid = () => crypto.randomUUID();
