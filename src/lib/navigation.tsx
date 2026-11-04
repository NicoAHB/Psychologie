import {
  CalendarDays,
  CalendarClock,
  BookOpen,
  LayoutDashboard,
  Mail,
  MoreHorizontal,
  Gift,
  NotebookPen,
  Settings2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "./types";
import type { TextKey } from "./i18n";
// These destinations are presentation state only; vault types stay unchanged.
export type AppRoute = Route | 'more' | 'guide';
export const mainNavigation: { id: AppRoute; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'clients', icon: Users },
  { id: 'appointments', icon: CalendarDays },
  { id: 'finances', icon: Wallet },
  { id: 'more', icon: MoreHorizontal },
];
type MoreGroup = 'practice' | 'communication';
export const moreNavigationGroups: { id: MoreGroup; title: TextKey; hint: TextKey }[] = [
  { id: 'practice', title: 'morePracticeGroup', hint: 'morePracticeGroupHint' },
  { id: 'communication', title: 'moreCommunicationGroup', hint: 'moreCommunicationGroupHint' },
];
// Add future tools here; the primary navigation always stays short.
export const moreNavigation: { id: Exclude<AppRoute, 'more'>; icon: LucideIcon; description: TextKey; group: MoreGroup }[] = [
  { id: 'guide', icon: BookOpen, description: 'moreGuideHint', group: 'practice' },
  { id: 'settings', icon: Settings2, description: 'moreSettingsHint', group: 'practice' },
  { id: 'newsletter', icon: Mail, description: 'moreNewsletterHint', group: 'communication' },
  { id: 'marketingCampaigns', icon: CalendarClock, description: 'moreCampaignsHint', group: 'communication' },
  { id: 'messageTemplates', icon: NotebookPen, description: 'moreTemplatesHint', group: 'communication' },
  { id: 'referrals', icon: Gift, description: 'moreReferralsHint', group: 'communication' },
];
export const isMoreRoute = (route: AppRoute) => route === 'more' || moreNavigation.some(item => item.id === route);
