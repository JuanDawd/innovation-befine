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
  Settings,
  CalendarDays,
  ClipboardList,
  Scissors,
  BookOpen,
  ReceiptIcon,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@befine/types";

export type NavItem = {
  key: string; // i18n key under "nav.*"
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export const NAV_ITEMS: Record<AppRole, NavItem[]> = {
  cashier_admin: [
    { key: "dashboard", href: "/cashier", icon: LayoutDashboard },
    { key: "ticketHistory", href: "/cashier/tickets/history", icon: ReceiptIcon },
    { key: "appointments", href: "/cashier/appointments/new", icon: CalendarDays },
    { key: "batches", href: "/admin/batches", icon: Layers },
    { key: "employees", href: "/admin/employees", icon: Users },
    { key: "catalog", href: "/admin/catalog", icon: BookOpen },
    { key: "settings", href: "/admin/settings", icon: Settings, disabled: true },
  ],
  secretary: [
    { key: "dashboard", href: "/secretary", icon: LayoutDashboard },
    { key: "batches", href: "/secretary/batches", icon: Layers },
    { key: "appointments", href: "/secretary/appointments/new", icon: CalendarDays },
    { key: "clients", href: "/secretary/clients", icon: Users, disabled: true },
  ],
  stylist: [{ key: "myTickets", href: "/stylist", icon: ClipboardList }],
  clothier: [{ key: "myWork", href: "/clothier", icon: Scissors }],
};

/** Roles whose primary device is mobile — use bottom tab bar instead of sidebar */
export const MOBILE_BOTTOM_NAV_ROLES: AppRole[] = ["stylist", "clothier"];
