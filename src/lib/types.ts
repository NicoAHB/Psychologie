import type { CrdtState } from './crdt';
import { normalizeClientAddress } from './clientAddress';
export type Language = 'de' | 'uk';
export type Currency = 'EUR' | 'UAH';
export type PaymentMethod = 'cash' | 'transfer';
export type ClientStatus = 'active' | 'paused' | 'closed';
/** Hrywnja per euro, stored with six decimal places as an integer. Never a patient-data request. */
export interface ExchangeRate { micros: number; date: string; source: 'nbu' | 'manual' }
export interface Billing {
  currency: Currency; amountCents: number; rate?: ExchangeRate;
  /** EUR comparison value is kept in the parent record's feeCents. */
}
export interface BankAccount { holder: string; iban: string; bank: string; bic: string }
export type Route = 'overview' | 'clients' | 'appointments' | 'finances' | 'settings' | 'newsletter' | 'marketingCampaigns' | 'messageTemplates' | 'referrals';
export type MarketingChannel = 'email' | 'telegram';
export type MarketingChannelSelection = MarketingChannel | 'both' | 'none';
export interface MarketingConsent { id: string; token: string; destination: string; grantedAt: string; revokedAt?: string }
// `updatedAt` is display/audit metadata. Causal CRDT registers drive device merging.
export interface Stamped { updatedAt?: number }
export interface ClientPostalAddress {
  street: string; additional: string; postalCode: string; city: string; region: string; country: string;
}
export interface Client extends Stamped {
  id: string; name: string; createdAt: string; language: Language; preparation: string;
  contact: string; telegramChatId: string; reminderConsent: boolean; avatarId?: string;
  /** Postal address for invoices. */
  address?: string;
  /** Optional on older vaults; one atomic postal snapshot, fully encrypted. */
  postalAddress?: ClientPostalAddress;
  /** Where the client lives (IANA name). Appointment times are always shown in this zone as well. */
  timeZone?: string;
  currency?: Currency;
  email?: string;
  /** Missing on old records means active. A status change never deletes clinical or financial records. */
  status?: ClientStatus;
  statusHistory?: { id: string; status: ClientStatus; at: string }[];
  followUpOn?: string;
  followUpNote?: string;
  birthday?: string;
  cancellationFee?: { currency: Currency; amountCents: number };
  appointmentEmailConsent?: { id: string; destination: string; grantedAt: string; revokedAt?: string };
  /** Separate opt-in for each marketing channel; reminder permission is unrelated. */
  marketingConsent?: Partial<Record<MarketingChannel, MarketingConsent>>;
}
export interface Appointment extends Stamped {
  id: string; clientId: string; date: string; time: string; duration: number;
  feeCents: number;
  billing?: Billing; originalFeeCents?: number;
  /** Zone in which `date` and `time` were agreed; the exact instant is derived from it. */
  timeZone: string; reminderId: string; status: 'scheduled' | 'completed' | 'cancelled' | 'noShow' | 'lateCancelled';
  emailDeliveries?: AppointmentEmailDelivery[];
  releasedSlots?: ReleasedSlot[];
  seriesId?: string;
}
export interface ReleasedSlot { id: string; date: string; time: string; duration: number; timeZone: string; releasedAt: string }
export interface WaitlistEntry extends Stamped { id: string; name: string; preferredTimes: string; note: string; createdAt: string; clientId?: string }
export interface CalendarAbsence extends Stamped {
  id: string; kind: 'vacation' | 'unavailable'; title: string;
  fromDate: string; untilDate: string; allDay: boolean;
  startTime?: string; endTime?: string; timeZone: string;
}
export interface Session extends Stamped {
  id: string; clientId: string; date: string; time: string; feeCents: number;
  paidAt: string | null; notes: string; tags: string[]; appointmentId?: string;
  /** Missing on legacy payments means unspecified, never an assumed payment method. */
  paymentMethod?: PaymentMethod;
  kind?: 'cancellationFee';
  failureStatus?: 'noShow' | 'lateCancelled';
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
/** An audio-only session attachment. Metadata lives inside the encrypted vault;
 * blobId points to the same AES-GCM file store used for session photos. */
export interface AudioMemo extends Stamped {
  id: string; clientId: string; sessionId: string; blobId: string; createdAt: string;
  mimeType: string; size: number; durationMs: number; label: string; summary: string;
}
export interface SessionDraftValues {
  date: string; time: string; fee: string; inputCurrency: Currency; rate?: ExchangeRate;
  paid: boolean; paymentDate: string; notes: string; tags: string; homework: string; homeworkDone: boolean;
  paymentMethod?: PaymentMethod;
  nextTopics: string; nextTouched: boolean; reviewPrevious: boolean; pricingChanged: boolean;
  photos: DocumentFile[]; removedPhotos: string[]; memos: AudioMemo[]; removedMemos: string[];
  editedMemos: Record<string, { label: string; summary: string }>;
}
/** Unfinished work: encrypted and backed up with the vault, never counted as a completed session. */
export interface SessionDraft extends Stamped {
  id: string; clientId: string; sessionId: string; originalSessionId?: string; appointmentId?: string;
  savedAt: string; payload: SessionDraftValues;
}
export interface InvoiceLine { sessionId: string; date: string; description: string; amountCents: number; euroCents?: number; rate?: ExchangeRate }
export interface Invoice extends Stamped {
  id: string; number: string; clientId: string; issuedAt: string; lines: InvoiceLine[]; totalCents: number;
  /** Snapshots: later edits of the client or practice profile never alter an issued invoice. */
  recipient: { name: string; address: string }; sender: PracticeProfile; language: Language;
  currency?: Currency; totalEuroCents?: number; paymentAccount?: BankAccount;
  dueOn?: string;
  kind?: 'invoice' | 'cancellation';
  cancels?: { id: string; number: string; issuedAt: string };
  replaces?: { id: string; number: string; issuedAt: string };
  correctionReason?: string;
  /** Payment state of the original at reversal time, unaffected by later payments on a replacement. */
  paymentSnapshot?: { sessionId: string; paidAt: string | null }[];
  /** Retained inside the encrypted vault when a previous cent-valued invoice is rounded. */
  originalAmounts?: { totalCents: number; lines: { sessionId: string; amountCents: number }[] };
}
export type AssessmentKind = 'phq9' | 'gad7';
export interface DocumentFile { blobId: string; fileName: string; mimeType: string; size: number }
export interface EmailDelivery {
  id: string; recipient: string; requestedAt: string; subject: string; body: string;
  acceptedAt?: string; providerId?: string;
  purpose?: 'invoice' | 'paymentReminder' | 'appointmentConfirmation' | 'appointmentReminder';
}
export interface AppointmentEmailDelivery extends EmailDelivery {
  purpose: 'appointmentConfirmation' | 'appointmentReminder';
  signature: string; consentId: string; calendar: string; state: 'sending' | 'unknown' | 'sent';
}
export interface DocumentReturn { id: string; file: DocumentFile; receivedOn: string; uploadedAt: string; assessmentId?: string }
export interface TelegramDelivery {
  id: string; recipient: string; requestedAt: string; text: string;
  acceptedAt?: string; messageId?: number;
  purpose?: 'invoice' | 'paymentReminder' | 'appointmentConfirmation' | 'appointmentReminder';
}
export interface DocumentShare { id: string; createdAt: string; expiresAt: string; link: string; revokedAt?: string }
export interface ClientDocument extends Stamped {
  id: string; clientId: string; title: string; file: DocumentFile; createdAt: string;
  kind?: AssessmentKind; language?: Language; returnExpected: boolean;
  deliveries: EmailDelivery[]; returns: DocumentReturn[];
  /** Each generated invoice copy preserves its payment status at the time of export. */
  invoiceId?: string; invoicePaidOn?: string | null; telegramDeliveries?: TelegramDelivery[];
  returnDueOn?: string; returnClosedAt?: string; shares?: DocumentShare[];
}
export interface Assessment extends Stamped {
  id: string; clientId: string; kind: AssessmentKind; date: string; answers: number[]; note: string;
  source?: { documentId: string; returnId: string; fileHash?: string };
}
export interface Template extends Stamped { id: string; name: string; body: string }
export interface MessageTemplate extends Stamped {
  id: string; title: string; category: 'info' | 'greeting' | 'organization';
  content: string; titleUk?: string; contentUk?: string; createdAt: string;
}
export interface MarketingCampaign extends Stamped {
  id: string; name: string; type: 'birthday' | 'welcome' | 'holiday'; templateId: string;
  channel: MarketingChannelSelection; isActive: boolean; triggerDays: number; targetDate?: string;
  welcomeFrom: 'created' | 'firstSession'; repeatYearly: boolean; sendAt: string; createdAt: string;
  language: 'all' | Language;
}
export type NewsletterStatus = 'sending' | 'sent' | 'partial' | 'failed' | 'unknown';
export interface NewsletterMessage {
  id: string; title: string; content: string; titleUk?: string; contentUk?: string; image?: DocumentFile;
}
export interface NewsletterRecipient {
  id: string; clientId: string; consentId: string; messageId: string; language: Language;
  channel: MarketingChannel;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown'; requestedAt?: string;
  acceptedAt?: string; providerId?: string; errorCode?: string;
}
export interface Newsletter extends Stamped {
  id: string; createdAt: string; channel: MarketingChannelSelection; campaignId?: string; occurrenceOn?: string;
  messages: NewsletterMessage[]; recipients: NewsletterRecipient[]; recipientCount: number; status: NewsletterStatus;
}
export interface PracticeProfile {
  name: string; address: string; taxId: string; iban: string; bank: string; taxNote: string; invoicePrefix: string; serviceName: string;
  accountHolder?: string; bic?: string; ibanUa?: string; bankUa?: string; accountHolderUa?: string; bicUa?: string;
}
export interface Settings {
  timeZone: string; advisorChatId: string; autoSync: boolean; remindersEnabled: boolean;
  autoLockMinutes?: number;
  practice: PracticeProfile; updatedAt?: number;
  exchangeRate?: ExchangeRate;
  /** Practice-wide memo title choices; encrypted with the rest of the vault. */
  memoLabels?: string[];
  memoLabelFavorites?: string[];
  marketingUsed?: boolean;
  referralProgram?: { rateBps: number; months: number };
  skipCloudSetup?: boolean;
  skipReminderSetup?: boolean;
  defaultCancellationFeeCents?: number;
  autoEmailReminders?: boolean;
  backupSafetyConfirmedAt?: string;
}
/** All relationships and financial information stay inside the encrypted vault. */
export interface ReferralCode extends Stamped {
  id: string; clientId: string; code: string; createdAt: string; revokedAt?: string;
}
export interface Referral extends Stamped {
  id: string; referrerId: string; referredId: string; code: string; registeredOn: string;
  consentAt: string; consentLanguage: Language; consentVersion: '2026-10-23';
  /** Terms are fixed at enrolment; later settings changes affect only new referrals. */
  rateBps: number; months: number; firstPaidOn?: string;
}
export interface ReferralPayout extends Stamped {
  /** One cumulative settlement per referrer, currency and completed calendar quarter. */
  id: string; referrerId: string; currency: Currency; through: string; paidOn: string;
  amountCents: number; allocations: { referralId: string; amountCents: number }[];
  /** A mistaken ledger entry is reversed, never silently overwritten or removed. */
  reverses?: string;
}
export interface VaultData {
  crdt?: CrdtState;
  schema: 1; clients: Client[]; appointments: Appointment[]; sessions: Session[]; notes: PhotoNote[];
  invoices: Invoice[]; assessments: Assessment[]; templates: Template[]; documents: ClientDocument[];
  availability: CalendarAbsence[]; audioMemos: AudioMemo[]; waitlist: WaitlistEntry[];
  sessionDrafts: SessionDraft[];
  messageTemplates: MessageTemplate[]; marketingCampaigns: MarketingCampaign[]; newsletters: Newsletter[];
  referralCodes: ReferralCode[]; referrals: Referral[]; referralPayouts: ReferralPayout[];
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
  schema: 1, clients: [], appointments: [], sessions: [], notes: [], invoices: [], assessments: [], templates: [], documents: [], availability: [], audioMemos: [], waitlist: [], sessionDrafts: [], messageTemplates: [], marketingCampaigns: [], newsletters: [], referralCodes: [], referrals: [], referralPayouts: [], deleted: {},
  settings: { timeZone: 'Europe/Berlin', advisorChatId: '', autoSync: false, remindersEnabled: false, practice: emptyPractice() },
});
/** Fill fields that vaults written by earlier versions lack. */
export function normalizeVault(value: VaultData, wholeAmounts = true): VaultData {
  const base = emptyVault();
  const result = { ...base, ...value, sessions: value.sessions.map(record => ({ ...record, ...(record.billing && { billing: { ...record.billing } }) })), appointments: value.appointments.map(record => ({ ...record, ...(record.billing && { billing: { ...record.billing } }) })), invoices: (value.invoices ?? []).map(invoice => ({ ...invoice })), assessments: value.assessments ?? [], templates: value.templates ?? [], deleted: value.deleted ?? {},
    documents: value.documents ?? [], waitlist: value.waitlist ?? [], availability: value.availability ?? [], audioMemos: value.audioMemos ?? [], sessionDrafts: value.sessionDrafts ?? [], messageTemplates: value.messageTemplates ?? [], marketingCampaigns: value.marketingCampaigns ?? [], newsletters: value.newsletters ?? [], referralCodes: (value.referralCodes ?? []).map(c => ({ ...c })), referrals: (value.referrals ?? []).map(r => ({ ...r })), referralPayouts: (value.referralPayouts ?? []).map(p => ({ ...p, allocations: p.allocations.map(a => ({ ...a })) })), settings: { ...base.settings, ...value.settings, practice: { ...base.settings.practice, ...value.settings?.practice } } };
  result.clients = value.clients.map(client => normalizeClientAddress(client, value.crdt?.entities[JSON.stringify(['clients', client.id])]?.postalAddress?.values.at(-1)?.value));
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
