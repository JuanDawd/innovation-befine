"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { NAV_ITEMS, MOBILE_BOTTOM_NAV_ROLES, type NavItem } from "./nav-config";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notification-bell";
import { VersionBanner } from "./version-banner";
import { ThemeToggle } from "./theme-toggle";
import type { NotificationRow } from "@/app/(protected)/notifications/actions";
import type { AppRole } from "@befine/types";

type AppShellProps = {
  role: AppRole;
  userName: string;
  employeeId: string | null;
  initialNotifications: NotificationRow[];
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

  // Bottom-tab variant for stylist/clothier mobile
  if (compact) {
    if (item.disabled) {
      return (
        <span
          className="flex flex-col items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground opacity-40"
          aria-disabled="true"
        >
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    }
    return (
      <Link
        href={item.href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  }

  // Sidebar variant — editorial rule-based row with a pink active bullet
  if (item.disabled) {
    return (
      <span
        className="flex items-center gap-2 border-b border-sidebar-border/40 py-2.5 text-sm text-sidebar-foreground/30"
        aria-disabled="true"
      >
        <span className="size-1 shrink-0 rounded-full bg-transparent" aria-hidden="true" />
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="italic">{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2 border-b border-sidebar-border/40 py-2.5 text-sm transition-all",
        "hover:pl-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "font-medium text-sidebar-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1 shrink-0 rounded-full transition-all",
          active ? "bg-primary shadow-[0_0_8px_var(--color-primary)]" : "bg-transparent",
        )}
      />
      <Icon className="size-4 shrink-0" aria-hidden="true" />
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
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-xs font-semibold text-primary-foreground"
      aria-hidden="true"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {initials || "?"}
    </span>
  );
}

/** Sub-company identifier in the sidebar — Befine / DoWell / Swimwear */
function CompanyStrip() {
  return (
    <div className="mx-4 rounded-sm border border-sidebar-border/60 bg-gradient-to-b from-primary/[0.06] to-transparent px-3 py-2.5">
      <div className="text-[9px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/50">
        Viewing
      </div>
      <div
        className="text-lg font-medium tracking-tight text-primary"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Befine
      </div>
      <div className="mt-1 flex gap-2.5 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/30">
        <span className="cursor-not-allowed">DoWell</span>
        <span className="cursor-not-allowed">Swimwear</span>
      </div>
    </div>
  );
}

export function AppShell({
  role,
  userName,
  employeeId,
  initialNotifications,
  children,
}: AppShellProps) {
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
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
        {/* Wordmark */}
        <div className="flex h-16 items-center border-b border-sidebar-border/60 px-5">
          <BrandLogo />
        </div>

        {/* Sub-company strip */}
        <div className="py-5">
          <CompanyStrip />
        </div>

        {/* Nav items */}
        <nav
          className="flex flex-1 flex-col gap-0 overflow-y-auto px-5 pb-4"
          aria-label="Navegación principal"
        >
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </nav>

        {/* Theme toggle + user + logout */}
        <div className="flex flex-col gap-3 border-t border-sidebar-border/60 p-4">
          <ThemeToggle className="self-start" />
          <div className="flex items-center gap-2.5">
            <UserInitials name={userName} />
            <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground">
              {userName}
            </span>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
              "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar shadow-xl transition-transform duration-200 md:hidden",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
          >
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border/60 px-5">
              <BrandLogo />
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label={t("nav.closeMenu")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="py-5">
              <CompanyStrip />
            </div>

            <nav
              className="flex flex-1 flex-col gap-0 overflow-y-auto px-5 pb-4"
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

            <div className="flex flex-col gap-3 border-t border-sidebar-border/60 p-4">
              <ThemeToggle className="self-start" />
              <div className="flex items-center gap-2.5">
                <UserInitials name={userName} />
                <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground">
                  {userName}
                </span>
                <button
                  onClick={handleLogout}
                  className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
            <BrandLogo />
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
              <BrandLogo />
              {/* Bell + logout on the right */}
              <div className="flex items-center gap-1">
                {employeeId && (
                  <NotificationBell
                    employeeId={employeeId}
                    initialNotifications={initialNotifications}
                  />
                )}
                <button
                  onClick={handleLogout}
                  className="rounded-md p-1.5 text-foreground opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("auth.logout")}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
          {/* Stylist/clothier: theme + logout on the right */}
          {usesBottomNav && (
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="rounded-md p-1.5 text-foreground opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("auth.logout")}
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </header>

        {/* Desktop header (hidden on mobile — sidebar handles identity there) */}
        <header className="hidden h-14 shrink-0 items-center justify-end gap-2 border-b border-border bg-background px-4 md:flex">
          {employeeId && (
            <NotificationBell employeeId={employeeId} initialNotifications={initialNotifications} />
          )}
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted"
            aria-label={t("nav.settings")}
          >
            <UserInitials name={userName} />
            <span className="text-sm text-foreground">{userName}</span>
          </Link>
        </header>

        {/* Version update banner — non-blocking, shown when a new deploy is detected */}
        <VersionBanner />

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
