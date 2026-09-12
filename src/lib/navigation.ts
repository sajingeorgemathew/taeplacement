import {
  Activity,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  /** Label shown in the sidebar and mobile navigation. */
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for the primary navigation.
 * Desktop sidebar, mobile drawer, and the page header all read from here.
 */
export const primaryNavigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Students", href: "/students", icon: Users },
  { label: "Placement", href: "/placement", icon: ClipboardList },
  { label: "Placement Partners", href: "/placement-partners", icon: Building2 },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Admin", href: "/admin", icon: Settings },
];

/** True when the given nav item matches the current pathname. */
export function isActiveNavItem(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Section label for the current route, used by the top header. */
export function getSectionLabel(pathname: string): string {
  const match = primaryNavigation.find((item) => isActiveNavItem(item, pathname));
  return match ? match.label : "TAE Placement";
}

export const APP_NAME = "TAE Placement";
export const APP_FULL_NAME = "Toronto Academy of Education Placement Management";
