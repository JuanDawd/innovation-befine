"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { NAV_ITEMS, MOBILE_BOTTOM_NAV_ROLES, type NavItem } from "./nav-config";
import type { AppRole } from "@befine/types";

type AppShellProps = {
  role: AppRole;
  userName: string;
  children: React.ReactNode;
};

function NavLink({
  item,
  active,
  onClick,
  compact,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("nav");
  const Icon = item.icon;
  const label = t(item.key as Parameters<typeof t>[0]);

  if (item.disabled) {
    return (
      <span
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-40 cursor-not-allowed",
          compact && "flex-col gap-1 px-2 py-1.5 text-xs",
        )}
        aria-disabled="true"
      >
        <Icon className={cn("shrink-0", compact ? "size-5" : "size-4")} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground",
        compact && "flex-col gap-1 px-2 py-1.5 text-xs",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={cn("shrink-0", compact ? "size-5" : "size-4")} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

function UserInitials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

export function AppShell({ role, userName, children }: AppShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = NAV_ITEMS[role];
  const usesBottomNav = MOBILE_BOTTOM_NAV_ROLES.includes(role);

  function isActive(item: NavItem) {
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  async function handleLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* ── Desktop sidebar ────────────────────────────────────────── */}
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
        {/* Wordmark */}
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <span className="text-sm font-bold text-sidebar-foreground">{t("common.appName")}</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Navegación principal">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </nav>

        {/* User + logout */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <UserInitials name={userName} />
            <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground">
              {userName}
            </span>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1.5 text-sidebar-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label={t("auth.logout")}
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile overlay drawer (admin / secretary) ──────────────── */}
      {!usesBottomNav && (
        <>
          {/* Backdrop */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              aria-hidden="true"
              onClick={() => setDrawerOpen(false)}
            />
          )}

          {/* Drawer panel */}
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar shadow-lg transition-transform duration-200 md:hidden",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
          >
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
              <span className="text-sm font-bold text-sidebar-foreground">
                {t("common.appName")}
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-sidebar-foreground opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label={t("nav.closeMenu")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <nav
              className="flex-1 space-y-0.5 overflow-y-auto p-2"
              aria-label="Navegación principal"
            >
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item)}
                  onClick={() => setDrawerOpen(false)}
                />
              ))}
            </nav>

            <div className="border-t border-sidebar-border p-3">
              <div className="flex items-center gap-2">
                <UserInitials name={userName} />
                <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground">
                  {userName}
                </span>
                <button
                  onClick={handleLogout}
                  className="shrink-0 rounded-md p-1.5 text-sidebar-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  aria-label={t("auth.logout")}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Main column: header + content ──────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          {usesBottomNav ? (
            /* Stylist / clothier: just the wordmark, no hamburger */
            <span className="text-sm font-bold">{t("common.appName")}</span>
          ) : (
            /* Admin / secretary: hamburger to open drawer */
            <>
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-md p-1.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("nav.openMenu")}
                aria-expanded={drawerOpen}
                aria-controls="mobile-drawer"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
              <span className="text-sm font-bold">{t("common.appName")}</span>
              {/* Logout on the right for mobile header */}
              <button
                onClick={handleLogout}
                className="rounded-md p-1.5 text-foreground opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("auth.logout")}
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
          {/* Stylist/clothier: show logout on the right */}
          {usesBottomNav && (
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 text-foreground opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("auth.logout")}
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          )}
        </header>

        {/* Desktop header (hidden on mobile — sidebar handles identity there) */}
        <header className="hidden h-14 shrink-0 items-center justify-end border-b border-border bg-background px-4 md:flex">
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted"
            aria-label={t("nav.settings")}
          >
            <UserInitials name={userName} />
            <span className="text-sm text-foreground">{userName}</span>
          </Link>
        </header>

        {/* Page content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto",
            usesBottomNav && "pb-16 md:pb-0", // space for bottom nav on mobile
          )}
        >
          {children}
        </main>

        {/* ── Mobile bottom tab bar (stylist / clothier) ─────────── */}
        {usesBottomNav && (
          <nav
            className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-background md:hidden"
            aria-label="Navegación principal"
          >
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item)} compact />
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
