"use client";

/**
 * DayAtAGlance — T093
 *
 * Cashier home summary strip. Leads with what the front desk acts on next —
 * "Por cobrar" (awaiting-payment total + count, with a shortcut to checkout) —
 * followed by the till (split Servicios · Pedidos · Prendas, T130), charged
 * tickets and work in progress.
 *
 * Shares `tickets.open` with CashierDashboard (one cached query) and reads
 * `businessDay.stats` for revenue / closed count. A failed server read is never
 * shown as zeros: the strip fetches on the client and shows an error with retry.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, ChevronRightIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { type DashboardTicket } from "@/app/(protected)/tickets/actions";
import { type DayStats } from "@/app/(protected)/cashier/actions/day-stats";
import { ticketTotal } from "@/components/cashier-dashboard-helpers";
import { queryKeys } from "@/lib/query-keys";
import { formatMoney } from "@/i18n";
import { fetchQuery } from "@/lib/action-query";
import { cn } from "@/lib/utils";
import { IncomeBreakdown } from "@/components/income-breakdown";

interface DayAtAGlanceProps {
  initialStats: DayStats;
  /** Same list the CashierDashboard receives — both seed `tickets.open`. */
  initialOpenTickets: DashboardTicket[];
  statsFailed?: boolean;
  ticketsFailed?: boolean;
}

const STRIP =
  "grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]";
const CELL = "flex min-w-0 flex-col bg-card p-4 lg:p-5";
const DISPLAY_NUMBER = "font-display font-light leading-none tracking-[-0.02em] tabular-nums";

/** A compact label/value row on phones; a stacked stat from `sm` up. */
function SecondaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        CELL,
        "flex-row items-baseline justify-between gap-3 py-3 sm:flex-col sm:items-stretch sm:justify-start sm:gap-2 sm:py-4 lg:py-5",
      )}
    >
      <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(DISPLAY_NUMBER, "text-xl text-foreground sm:text-2xl xl:text-3xl")}
        suppressHydrationWarning
      >
        {value}
      </p>
      <div className="hidden text-xs text-muted-foreground sm:block">{sub}</div>
    </div>
  );
}

function SkeletonCell({ lead = false }: { lead?: boolean }) {
  return (
    <div className={cn(CELL, "gap-3", lead && "sm:col-span-2 lg:col-span-1")}>
      <div className="h-3 w-20 rounded bg-muted animate-pulse" />
      <div className={cn("rounded bg-muted animate-pulse", lead ? "h-9 w-40" : "h-7 w-24")} />
      <div className="h-3 w-28 rounded bg-muted animate-pulse" />
    </div>
  );
}

export function DayAtAGlanceSkeleton() {
  return (
    <div className={STRIP}>
      <SkeletonCell lead />
      <SkeletonCell />
      <SkeletonCell />
      <SkeletonCell />
    </div>
  );
}

export function DayAtAGlance({
  initialStats,
  initialOpenTickets,
  statsFailed = false,
  ticketsFailed = false,
}: DayAtAGlanceProps) {
  const t = useTranslations("dayAtAGlance");

  // Shared with CashierDashboard — one cached query, one fetch.
  const { data: openTickets } = useQuery({
    queryKey: queryKeys.tickets.open,
    queryFn: () => fetchQuery("openTickets"),
    initialData: ticketsFailed ? undefined : initialOpenTickets,
    refetchInterval: 30_000,
  });
  // Revenue/closed change on checkout — invalidated with "businessDay".
  const {
    data: stats,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: queryKeys.businessDay.stats,
    queryFn: () => fetchQuery("dayStats"),
    initialData: statsFailed ? undefined : initialStats,
    refetchInterval: 30_000,
  });

  if (!openTickets || (!stats && !statsError)) return <DayAtAGlanceSkeleton />;

  const awaiting = openTickets.filter((tk) => tk.status === "awaiting_payment");
  const awaitingTotal = awaiting.reduce((s, tk) => s + ticketTotal(tk), 0);
  const inProgressCount = openTickets.length - awaiting.length;

  return (
    <section aria-label={t("summaryLabel")} className={STRIP}>
      {/* Lead: what the front desk acts on next */}
      <div className={cn(CELL, "gap-3 sm:col-span-2 lg:col-span-1")}>
        <p className="text-sm font-semibold text-foreground">{t("awaitingPayment")}</p>
        <p className={cn(DISPLAY_NUMBER, "text-4xl text-foreground")} suppressHydrationWarning>
          {formatMoney(awaitingTotal)}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-muted-foreground">
            {t("awaitingSub", { count: awaiting.length })}
          </p>
          {awaiting.length > 0 && (
            <Link
              href="/cashier/checkout"
              scroll={false}
              className={cn(buttonVariants({ size: "sm" }), "gap-1 pointer-coarse:h-11")}
            >
              {t("chargeAction")}
              <ChevronRightIcon className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {stats ? (
        <>
          <SecondaryStat
            label={t("revenueToday")}
            value={formatMoney(stats.revenue)}
            sub={<IncomeBreakdown income={stats.income} compact />}
          />
          <SecondaryStat
            label={t("closedTickets")}
            value={String(stats.closedCount)}
            sub={t("closedTicketsSub")}
          />
        </>
      ) : (
        <div role="alert" className={cn(CELL, "gap-2 sm:col-span-2 lg:col-span-2")}>
          <p className="flex items-center gap-1.5 text-sm font-medium text-status-negative-foreground">
            <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
            {t("statsErrorTitle")}
          </p>
          <p className="text-xs text-muted-foreground">{t("statsErrorDescription")}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-auto self-start"
            onClick={() => void refetchStats()}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      <SecondaryStat
        label={t("inProgress")}
        value={String(inProgressCount)}
        sub={t("inProgressSub", { count: inProgressCount })}
      />
    </section>
  );
}
