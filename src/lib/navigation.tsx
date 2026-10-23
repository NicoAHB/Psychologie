import {
  CalendarDays,
  CalendarClock,
  LayoutDashboard,
  Mail,
  NotebookPen,
  Settings2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "./types";
import type { TextKey } from "./i18n";
export const navigationGroups: {
  id: string;
  label?: TextKey;
  items: { id: Route; icon: LucideIcon }[];
}[] = [
  {
    id: "practice",
    items: [
      { id: "overview", icon: LayoutDashboard },
      { id: "clients", icon: Users },
      { id: "appointments", icon: CalendarDays },
      { id: "finances", icon: Wallet },
      { id: "settings", icon: Settings2 },
    ],
  },
  {
    id: "marketing",
    label: "marketing",
    items: [
      { id: "newsletter", icon: Mail },
      { id: "marketingCampaigns", icon: CalendarClock },
      { id: "messageTemplates", icon: NotebookPen },
    ],
  },
];
