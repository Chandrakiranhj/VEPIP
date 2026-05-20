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
      },
      {
        title: "Generate Reports",
        url: "/reports",
        icon: FileText,
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
        // Org-wide financials: admin, leadership, and finance only.
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
      },
    ],
  },
];

export function getSidebarItemsForRole(role?: string | null): NavGroup[] {
  // Admin, leadership, and finance see org-wide ("adminOnly") items like the
  // financial command center. Everyone else sees the rest, scoped to the
  // projects they're assigned to.
  const isPrivileged = role === "admin" || role === "leadership" || role === "finance";

  return sidebarItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isPrivileged || !item.adminOnly),
    }))
    .filter((group) => group.items.length > 0);
}
