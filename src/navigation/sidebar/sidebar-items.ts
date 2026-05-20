import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  Sparkles,
  Users,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  adminOnly?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Command Center",
    items: [
      {
        title: "Leadership View",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Projects",
        url: "/projects",
        icon: Gauge,
      },
    ],
  },
  {
    id: 2,
    label: "Intake & Reporting",
    items: [
      {
        title: "AI Intake",
        url: "/intake",
        icon: Sparkles,
        isNew: true,
        adminOnly: true,
      },
      {
        title: "Generate Reports",
        url: "/reports",
        icon: FileText,
        adminOnly: true,
      },
    ],
  },
  {
    id: 3,
    label: "Financials",
    items: [
      {
        title: "Funds & Analytics",
        url: "/dashboard/funds",
        icon: Banknote,
        adminOnly: true,
      },
    ],
  },
  {
    id: 4,
    label: "Organisation",
    items: [
      {
        title: "People",
        url: "/people",
        icon: Users,
        adminOnly: true,
      },
    ],
  },
];

export function getSidebarItemsForRole(role?: string | null): NavGroup[] {
  const isAdmin = role === "admin";

  return sidebarItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isAdmin || !item.adminOnly),
    }))
    .filter((group) => group.items.length > 0);
}
