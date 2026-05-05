/**
 * Role-aware navigation configuration — T090
 *
 * Each role gets its own ordered list of nav items.
 * `href` must match the route prefix owned by that role.
 * `disabled` items are rendered but not clickable — future routes.
 */

import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  Scissors,
  BookOpen,
  ReceiptIcon,
  Layers,
  ShoppingBag,
  Wallet,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@befine/types";

export type NavItem = {
  key: string; // i18n key under "nav.*"
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export type NavGroup = { labelKey: string; items: string[] };

export const NAV_ITEMS: Record<AppRole, NavItem[]> = {
  cashier_admin: [
    { key: "dashboard", href: "/cashier", icon: LayoutDashboard },
    { key: "ticketHistory", href: "/cashier/tickets/history", icon: ReceiptIcon },
    { key: "appointments", href: "/cashier/appointments", icon: CalendarDays },
    { key: "largeOrders", href: "/large-orders", icon: ShoppingBag },
    { key: "craftables", href: "/admin/craftables", icon: Layers },
    { key: "employees", href: "/admin/employees", icon: Users },
    { key: "catalog", href: "/admin/catalog", icon: BookOpen },
    { key: "absences", href: "/admin/absences", icon: CalendarOff },
    { key: "payroll", href: "/admin/payroll", icon: Wallet },
    { key: "analytics", href: "/admin/analytics", icon: BarChart3 },
  ],
  secretary: [
    { key: "dashboard", href: "/secretary", icon: LayoutDashboard },
    { key: "largeOrders", href: "/large-orders", icon: ShoppingBag },
    { key: "craftables", href: "/secretary/craftables", icon: Layers },
    { key: "appointments", href: "/secretary/appointments", icon: CalendarDays },
    { key: "myEarnings", href: "/secretary/earnings", icon: Wallet },
  ],
  stylist: [
    { key: "myTickets", href: "/stylist", icon: ClipboardList },
    { key: "myEarnings", href: "/stylist/earnings", icon: Wallet },
  ],
  clothier: [
    { key: "myWork", href: "/clothier", icon: Scissors },
    { key: "myEarnings", href: "/clothier/earnings", icon: Wallet },
  ],
};

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "groupCore",
    items: ["dashboard", "myTickets", "myWork"],
  },
  {
    labelKey: "groupOperations",
    items: ["appointments", "largeOrders", "craftables", "ticketHistory"],
  },
  {
    labelKey: "groupPeople",
    items: ["employees", "clients"],
  },
  {
    labelKey: "groupFinance",
    items: ["payroll", "myEarnings"],
  },
  {
    labelKey: "groupManagement",
    items: ["catalog", "absences", "analytics"],
  },
];

function indexItems(items: NavItem[]) {
  const map = new Map<string, NavItem>();

  for (const item of items) {
    map.set(item.key, item);
  }

  return map;
}

export function resolveGroups(items: NavItem[]) {
  const itemMap = indexItems(items);

  return NAV_GROUPS.map((group) => {
    const resolvedItems = group.items.map((key) => itemMap.get(key)).filter(Boolean) as NavItem[];

    return {
      labelKey: group.labelKey,
      items: resolvedItems,
    };
  }).filter((group) => group.items.length > 0);
}

/** Roles whose primary device is mobile — use bottom tab bar instead of sidebar */
export const MOBILE_BOTTOM_NAV_ROLES: AppRole[] = ["stylist", "clothier"];
