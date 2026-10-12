"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LogOutIcon,
  MoonIcon,
  SunIcon,
  UserRoundIcon,
  CreditCardIcon,
  PlusIcon,
  ShoppingBagIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { NAV_ITEMS, MOBILE_BOTTOM_NAV_ROLES, type NavItem, resolveGroups } from "./nav-config";

import { NotificationBell } from "./notification-bell";
import { VersionBanner } from "./version-banner";
import { RealtimeQueryBridge } from "@/components/realtime-query-bridge";
import { getQueryClient } from "@/lib/query-client";
import { useTheme } from "@/hooks/use-theme";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogServiceForm } from "@/components/log-service-form";
import { CheckoutForm } from "@/components/checkout-form";
import { SellClothPieceModal } from "@/components/sell-cloth-piece-modal";
import type { NotificationRow } from "@/app/(protected)/notifications/actions";
import type { AppRole } from "@befine/types";

type AppShellProps = {
  role: AppRole;
  userName: string;
  employeeId: string | null;
  showEarnings: boolean;
  initialNotifications: NotificationRow[];
  sidebarDefaultOpen?: boolean;
  children: React.ReactNode;
};

// ─── Shared bits ──────────────────────────────────────────────────────────────

function UserInitials({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary/60 font-semibold text-primary-foreground",
        size === "sm" ? "size-7 text-xs" : "size-8 text-xs",
      )}
      aria-hidden="true"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {initials || "?"}
    </span>
  );
}

const SKIP_LINK_CLASS =
  "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:ring-3 focus:ring-ring/50";

/** Wordmark for the mobile top bars. */
function BrandMark() {
  return (
    <span className="font-display text-lg font-medium tracking-tight text-primary">Befine</span>
  );
}

/** Sub-company identifier — Befine / DoWell / Swimwear */
function CompanyStrip() {
  const t = useTranslations("nav");
  return (
    <div className="mx-2 mt-1 rounded-sm border border-sidebar-border/60 bg-linear-to-b from-primary/6 to-transparent px-3 py-2.5 group-data-[collapsible=icon]:hidden">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-sidebar-foreground/60">
        {t("viewingCompany")}
      </div>
      <div
        className="text-lg font-medium tracking-tight text-primary"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Befine
      </div>
      <div className="mt-1 flex gap-2.5 text-xs uppercase tracking-[0.14em] text-sidebar-foreground/50">
        <span className="cursor-not-allowed">DoWell</span>
        <span className="cursor-not-allowed">Swimwear</span>
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<AppRole, string> = {
  cashier: "Cajero",
  admin: "Admin",
  secretary: "Secretaria",
  stylist: "Estilista",
  clothier: "Confeccionista",
};

/** Avatar + dropdown menu (profile, theme switch, logout). */
function UserMenu({
  userName,
  role,
  onLogout,
  variant = "sidebar",
}: {
  userName: string;
  role: AppRole;
  onLogout: () => void;
  /** "bar" = compact trigger on the page background (mobile top bar). */
  variant?: "sidebar" | "bar";
}) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id="user-menu-trigger"
        aria-label={t("nav.openUserMenu")}
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-md p-1 text-left outline-none transition-colors",
          variant === "sidebar"
            ? "flex-1 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            : "rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <UserInitials name={userName} />
        {variant === "sidebar" && (
          <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {userName}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "sidebar" ? "top" : "bottom"}
        align={variant === "sidebar" ? "start" : "end"}
        className="w-56"
      >
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/profile" />} className="cursor-pointer">
            <UserRoundIcon className="size-4" aria-hidden="true" />
            {t("nav.profile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            closeOnClick={false}
            className="cursor-pointer"
          >
            {/*
             * Both icon+label pairs are always in the DOM; CSS dark: classes control which
             * is visible. This makes the React tree identical on server and client, eliminating
             * the hydration mismatch that recurs whenever the theme hook implementation changes.
             */}
            <MoonIcon className="size-4 dark:hidden" aria-hidden="true" />
            <SunIcon className="size-4 hidden dark:block" aria-hidden="true" />
            <span className="dark:hidden">{t("nav.themeDark")}</span>
            <span className="hidden dark:inline">{t("nav.themeLight")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onLogout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOutIcon className="size-4" aria-hidden="true" />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Sidebar nav row ──────────────────────────────────────────────────────────

function SidebarNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations("nav");
  const Icon = item.icon;
  const label = t(item.key as Parameters<typeof t>[0]);
  // Stable id prevents Base UI's useId() from generating different values on server vs client.
  const stableId = `nav-${item.href.replace(/^\//, "").replace(/\//g, "-") || "home"}`;

  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          disabled
          tooltip={label}
          id={stableId}
          className="cursor-not-allowed opacity-40"
        >
          <Icon aria-hidden="true" />
          <span className="italic">{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
        isActive={active}
        tooltip={label}
        id={stableId}
        className="data-[active=true]:bg-transparent data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-1 shrink-0 rounded-full transition-[background-color,box-shadow] group-data-[collapsible=icon]:hidden",
            active ? "bg-primary shadow-[0_0_8px_var(--color-primary)]" : "bg-transparent",
          )}
        />
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─── Bottom-tab nav (stylist / clothier mobile) ───────────────────────────────

function BottomTabLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations("nav");
  const Icon = item.icon;
  const label = t(item.key as Parameters<typeof t>[0]);

  if (item.disabled) {
    return (
      <span
        className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-2 text-xs text-muted-foreground opacity-40"
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-2 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AppShell({
  role,
  userName,
  employeeId,
  showEarnings,
  initialNotifications,
  sidebarDefaultOpen = true,
  children,
}: AppShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();

  const [logServiceOpen, setLogServiceOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);

  const navItems = NAV_ITEMS[role].filter((item) => item.key !== "myEarnings" || showEarnings);
  const grouped = resolveGroups(navItems);

  const usesBottomNav = MOBILE_BOTTOM_NAV_ROLES.includes(role);

  function getActiveHref(items: NavItem[], pathname: string): string | null {
    let bestMatch: string | null = null;

    for (const item of items) {
      const href = item.href;

      if (pathname === href || pathname.startsWith(href + "/")) {
        if (!bestMatch || href.length > bestMatch.length) {
          bestMatch = href;
        }
      }
    }

    return bestMatch;
  }

  function isActive(item: NavItem, activeHref: string | null): boolean {
    return item.href === activeHref;
  }

  const activeHref = getActiveHref(NAV_ITEMS[role], pathname);

  async function handleLogout() {
    await signOut();
    // Drop cached server state so the next user on a shared device starts clean.
    getQueryClient().clear();
    router.push("/login");
    router.refresh();
  }

  // Stylist / clothier: mobile-first bottom tabs, no sidebar
  if (usesBottomNav) {
    return (
      <div data-bottom-nav className="flex h-dvh flex-col overflow-hidden bg-background">
        <a href="#main" className={SKIP_LINK_CLASS}>
          {t("nav.skipToContent")}
        </a>
        {/* Top bar — in flow, so it never covers the page title */}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)]">
          <BrandMark />
          <div className="flex h-14 items-center gap-1">
            {employeeId && (
              <NotificationBell
                employeeId={employeeId}
                initialNotifications={initialNotifications}
              />
            )}
            <UserMenu userName={userName} role={role} onLogout={handleLogout} variant="bar" />
          </div>
        </header>

        <VersionBanner />
        <RealtimeQueryBridge role={role} />

        <main id="main" className="flex-1 overflow-y-auto pb-[var(--app-bottom-inset)]">
          {children}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
          aria-label={t("nav.mainNavigation")}
        >
          {navItems.map((item) => (
            <BottomTabLink key={item.href} item={item} active={isActive(item, activeHref)} />
          ))}
        </nav>
      </div>
    );
  }

  // Admin / secretary: shadcn collapsible sidebar
  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <CompanyStrip />
        </SidebarHeader>

        <SidebarContent>
          {grouped.map((group) => (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel>
                {t(`nav.${group.labelKey}` as Parameters<typeof t>[0])}
              </SidebarGroupLabel>

              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarNavItem key={item.href} item={item} active={isActive(item, activeHref)} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="gap-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setLogServiceOpen(true)}
                tooltip={t("tickets.logService")}
                id="sidebar-log-service"
              >
                <PlusIcon aria-hidden="true" />
                <span>{t("tickets.logService")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {(role === "cashier" || role === "admin" || role === "secretary") && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setSellOpen(true)}
                  tooltip="Vender prenda"
                  id="sidebar-sell"
                >
                  <ShoppingBagIcon aria-hidden="true" />
                  <span>Vender prenda</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {/* Checkout is cashier/admin-only server-side (M-67) */}
            {(role === "cashier" || role === "admin") && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setCheckoutOpen(true)}
                  tooltip={t("dayAtAGlance.actionCheckout")}
                  id="sidebar-checkout"
                >
                  <CreditCardIcon aria-hidden="true" />
                  <span>{t("dayAtAGlance.actionCheckout")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>

          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-2">
            <UserMenu userName={userName} role={role} onLogout={handleLogout} />
            {employeeId && (
              <NotificationBell
                employeeId={employeeId}
                initialNotifications={initialNotifications}
                side="top"
              />
            )}
            <SidebarTrigger
              className="ml-auto hidden size-8 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground md:flex group-data-[collapsible=icon]:ml-0"
              aria-label={t("nav.openMenu")}
            />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex min-w-0 flex-1 flex-col">
        <a href="#main" className={SKIP_LINK_CLASS}>
          {t("nav.skipToContent")}
        </a>
        {/* Mobile top bar — in flow; desktop hides it (sidebar is always visible there) */}
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-2 pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-14 items-center gap-2">
            <SidebarTrigger className="size-11" aria-label={t("nav.openMenu")} />
            <BrandMark />
          </div>
        </header>

        <VersionBanner />
        <RealtimeQueryBridge role={role} />

        <main id="main" className="flex-1 overflow-y-auto">
          {children}
        </main>
      </SidebarInset>

      <Dialog open={logServiceOpen} onOpenChange={setLogServiceOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("tickets.logService")}</DialogTitle>
          </DialogHeader>
          {logServiceOpen && (
            <LogServiceForm
              currentEmployeeId={employeeId ?? ""}
              isStylist={false}
              redirectPath={role === "secretary" ? "/secretary" : "/cashier"}
              onClose={() => setLogServiceOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dayAtAGlance.actionCheckout")}</DialogTitle>
          </DialogHeader>
          {checkoutOpen && <CheckoutForm onClose={() => setCheckoutOpen(false)} />}
        </DialogContent>
      </Dialog>

      <SellClothPieceModal open={sellOpen} onOpenChange={setSellOpen} />
    </SidebarProvider>
  );
}
