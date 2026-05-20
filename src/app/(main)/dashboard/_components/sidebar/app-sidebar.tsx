"use client";

import Link from "next/link";
import { CircleHelp, ClipboardList, Database, File, Search, Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useQuery } from "convex/react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { rootUser } from "@/data/users";
import { getSidebarItemsForRole } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { api } from "../../../../../../convex/_generated/api";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const currentPerson = useQuery(api.people.current);

  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  const displayUser = currentPerson 
    ? { name: currentPerson.name, email: currentPerson.email, avatar: "" }
    : rootUser;
  const navItems = getSidebarItemsForRole(currentPerson?.role);

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/dashboard" className="flex flex-col items-start gap-1.5 h-auto py-2">
                <img src="/ve-logo-horizontal.svg" alt="Vision Empower" className="h-9 w-auto object-contain" />
                <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Project Intelligence Platform</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={displayUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
