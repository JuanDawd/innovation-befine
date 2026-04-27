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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { NAV_ITEMS, MOBILE_BOTTOM_NAV_ROLES, type NavItem, resolveGroups } from "./nav-config";

import { NotificationBell } from "./notification-bell";
import { VersionBanner } from "./version-banner";
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
import type { NotificationRow } from "@/app/(protected)/notifications/actions";
import type { AppRole } from "@befine/types";

type AppShellProps = {
  role: AppRole;
  userName: string;
  employeeId: string | null;
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
        size === "sm" ? "size-7 text-[11px]" : "size-8 text-xs",
      )}
      aria-hidden="true"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {initials || "?"}
    </span>
  );
}

/** Sub-company identifier — Befine / DoWell / Swimwear */
function CompanyStrip() {
  return (
    <div className="mx-2 mt-1 rounded-sm border border-sidebar-border/60 bg-linear-to-b from-primary/6 to-transparent px-3 py-2.5 group-data-[collapsible=icon]:hidden">
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

const ROLE_LABELS: Record<AppRole, string> = {
  cashier_admin: "Admin",
  secretary: "Secretaria",
  stylist: "Estilista",
  clothier: "Confeccionista",
};

/** Avatar + dropdown menu (profile, theme switch, logout). */
function UserMenu({
  userName,
  role,
  onLogout,
}: {
  userName: string;
  role: AppRole;
  onLogout: () => void;
}) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("nav.openUserMenu")}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <UserInitials name={userName} />
        <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          {userName}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
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
            suppressHydrationWarning
          >
            {theme === "dark" ? (
              <>
                <SunIcon className="size-4" aria-hidden="true" suppressHydrationWarning />
                <span suppressHydrationWarning>{t("nav.themeLight")}</span>
              </>
            ) : (
              <>
                <MoonIcon className="size-4" aria-hidden="true" suppressHydrationWarning />
                <span suppressHydrationWarning>{t("nav.themeDark")}</span>
              </>
            )}
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

  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled tooltip={label} className="cursor-not-allowed opacity-40">
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
        className="data-[active=true]:bg-transparent data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-1 shrink-0 rounded-full transition-all group-data-[collapsible=icon]:hidden",
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
  initialNotifications,
  sidebarDefaultOpen = true,
  children,
}: AppShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();

  const [logServiceOpen, setLogServiceOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const navItems = NAV_ITEMS[role];
  const grouped = resolveGroups(NAV_ITEMS[role]);

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
    router.push("/login");
    router.refresh();
  }

  // Stylist / clothier: mobile-first bottom tabs, no sidebar
  if (usesBottomNav) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        {/* Floating utility pill (mobile top-right) */}
        <div className="fixed right-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-1.5 py-1 shadow-sm backdrop-blur">
          <UserMenu userName={userName} role={role} onLogout={handleLogout} />
          {employeeId && (
            <NotificationBell employeeId={employeeId} initialNotifications={initialNotifications} />
          )}
        </div>

        <VersionBanner />

        <main className="flex-1 overflow-y-auto pb-16">{children}</main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-background"
          aria-label="Navegación principal"
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
              >
                <PlusIcon aria-hidden="true" />
                <span>{t("tickets.logService")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setCheckoutOpen(true)}
                tooltip={t("dayAtAGlance.actionCheckout")}
              >
                <CreditCardIcon aria-hidden="true" />
                <span>{t("dayAtAGlance.actionCheckout")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
        {/* Mobile trigger — floats top-left, desktop hides (sidebar is always visible there) */}
        <SidebarTrigger
          className="fixed left-3 top-3 z-30 size-10 rounded-full border border-border bg-background/90 shadow-sm backdrop-blur md:hidden"
          aria-label={t("nav.openMenu")}
        />

        <VersionBanner />

        <main className="flex-1 overflow-y-auto">{children}</main>
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
              redirectPath="/cashier"
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
    </SidebarProvider>
  );
}
