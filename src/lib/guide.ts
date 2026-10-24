import { translate, type TextKey } from './i18n';
import type { SettingsSection } from './practiceFlow';
import { fold } from './search';
import type { Route } from './types';

export type GuideDestination =
  | { route: 'settings'; section: SettingsSection }
  | { route: 'appointments'; waitlist?: boolean }
  | { route: Exclude<Route, 'settings' | 'appointments'> };
interface GuideAction { label: TextKey; target: GuideDestination }
export const guideGroups = [
  { id: 'start', title: 'guideGroupStart' },
  { id: 'daily', title: 'guideGroupDaily' },
  { id: 'safe', title: 'guideGroupSafe' },
  { id: 'extras', title: 'guideGroupExtras' },
] as const;
export interface GuideTopic {
  id: string; group: typeof guideGroups[number]['id'];
  title: TextKey; summary: TextKey; steps: TextKey; tip: TextKey;
  actions: readonly GuideAction[];
}
export const guideTopics = [
  { id: 'setup', group: 'start', title: 'guideSetupTitle', summary: 'guideSetupSummary', steps: 'guideSetupSteps', tip: 'guideSetupTip', actions: [
    { label: 'guidePracticeAction', target: { route: 'settings', section: 'practice' } },
    { label: 'guideBanksAction', target: { route: 'settings', section: 'banks' } },
  ] },
  { id: 'clients', group: 'start', title: 'guideClientsTitle', summary: 'guideClientsSummary', steps: 'guideClientsSteps', tip: 'guideClientsTip', actions: [
    { label: 'guideClientsAction', target: { route: 'clients' } },
  ] },
  { id: 'appointments', group: 'daily', title: 'guideAppointmentsTitle', summary: 'guideAppointmentsSummary', steps: 'guideAppointmentsSteps', tip: 'guideAppointmentsTip', actions: [
    { label: 'guideAppointmentsAction', target: { route: 'appointments' } },
    { label: 'guideWaitlistAction', target: { route: 'appointments', waitlist: true } },
  ] },
  { id: 'notes', group: 'daily', title: 'guideNotesTitle', summary: 'guideNotesSummary', steps: 'guideNotesSteps', tip: 'guideNotesTip', actions: [
    { label: 'guideClientsAction', target: { route: 'clients' } },
  ] },
  { id: 'followups', group: 'daily', title: 'guideFollowupsTitle', summary: 'guideFollowupsSummary', steps: 'guideFollowupsSteps', tip: 'guideFollowupsTip', actions: [
    { label: 'guideTodayAction', target: { route: 'overview' } },
  ] },
  { id: 'questionnaires', group: 'daily', title: 'guideQuestionnairesTitle', summary: 'guideQuestionnairesSummary', steps: 'guideQuestionnairesSteps', tip: 'guideQuestionnairesTip', actions: [
    { label: 'guideClientsAction', target: { route: 'clients' } },
  ] },
  { id: 'documents', group: 'daily', title: 'guideDocumentsTitle', summary: 'guideDocumentsSummary', steps: 'guideDocumentsSteps', tip: 'guideDocumentsTip', actions: [
    { label: 'guideClientsAction', target: { route: 'clients' } },
  ] },
  { id: 'payments', group: 'daily', title: 'guidePaymentsTitle', summary: 'guidePaymentsSummary', steps: 'guidePaymentsSteps', tip: 'guidePaymentsTip', actions: [
    { label: 'guidePaymentsAction', target: { route: 'finances' } },
    { label: 'guideBanksAction', target: { route: 'settings', section: 'banks' } },
  ] },
  { id: 'backups', group: 'safe', title: 'guideBackupsTitle', summary: 'guideBackupsSummary', steps: 'guideBackupsSteps', tip: 'guideBackupsTip', actions: [
    { label: 'guideBackupAction', target: { route: 'settings', section: 'backup' } },
    { label: 'guideSecurityAction', target: { route: 'settings', section: 'security' } },
  ] },
  { id: 'devices', group: 'safe', title: 'guideDevicesTitle', summary: 'guideDevicesSummary', steps: 'guideDevicesSteps', tip: 'guideDevicesTip', actions: [
    { label: 'guideBackupAction', target: { route: 'settings', section: 'backup' } },
    { label: 'guideCloudAction', target: { route: 'settings', section: 'cloud' } },
  ] },
  { id: 'help', group: 'safe', title: 'guideHelpTitle', summary: 'guideHelpSummary', steps: 'guideHelpSteps', tip: 'guideHelpTip', actions: [
    { label: 'guideAppearanceAction', target: { route: 'settings', section: 'appearance' } },
    { label: 'guideSecurityAction', target: { route: 'settings', section: 'security' } },
  ] },
  { id: 'messages', group: 'extras', title: 'guideMessagesTitle', summary: 'guideMessagesSummary', steps: 'guideMessagesSteps', tip: 'guideMessagesTip', actions: [
    { label: 'guideRemindersAction', target: { route: 'settings', section: 'reminders' } },
    { label: 'guideClientsAction', target: { route: 'clients' } },
  ] },
  { id: 'marketing', group: 'extras', title: 'guideMarketingTitle', summary: 'guideMarketingSummary', steps: 'guideMarketingSteps', tip: 'guideMarketingTip', actions: [
    { label: 'guideNewsletterAction', target: { route: 'newsletter' } },
    { label: 'guideTemplatesAction', target: { route: 'messageTemplates' } },
    { label: 'guideCampaignsAction', target: { route: 'marketingCampaigns' } },
    { label: 'guideReferralsAction', target: { route: 'referrals' } },
  ] },
  { id: 'video', group: 'extras', title: 'guideVideoTitle', summary: 'guideVideoSummary', steps: 'guideVideoSteps', tip: 'guideVideoTip', actions: [
    { label: 'guideClientsAction', target: { route: 'clients' } },
  ] },
] as const satisfies readonly GuideTopic[];

// Only public help text is indexed, once. Both languages stay searchable when
// the reader changes the interface language; no client records enter this index.
const index = guideTopics.map(topic => {
  const keys: TextKey[] = [topic.title, topic.summary, topic.steps, topic.tip, ...topic.actions.map(action => action.label)];
  return { topic, text: fold((['de', 'uk'] as const).flatMap(language => keys.map(key => translate(language, key))).join('\n')).folded };
});
export function findGuideTopics(query: string): readonly GuideTopic[] {
  const terms = fold(query.slice(0, 120)).folded.split(/\s+/).filter(Boolean);
  return index.filter(row => terms.every(term => row.text.includes(term))).map(row => row.topic);
}
