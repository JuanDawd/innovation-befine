"use client";

/**
 * DayAtAGlance — T093
 *
 * Admin home stats panel: revenue today, open/closed ticket counts (live), quick actions.
 * When no business day is open, renders an empty state instead of zero-stats.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useCallback, useTransition } from "react";
import {
  TrendingUpIcon,
  TicketIcon,
  ReceiptIcon,
  UsersIcon,
  BookOpenIcon,
  CheckCircleIcon,
  CalendarCheckIcon,
} from "lucide-react";
import { useRealtimeEvent } from "@befine/realtime/client";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { listOpenTickets } from "@/app/(protected)/tickets/actions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DayAtAGlanceProps {
  revenue: number;
  closedCount: number;
  initialOpenCount: number;
  isDayOpen: boolean;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border pt-5 pr-6",
        accent && "border-t-primary",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-[10px] font-medium uppercase tracking-[0.22em]">{label}</span>
      </div>
      <p
        className={cn(
          "text-5xl font-light leading-[0.95] tracking-[-0.035em] tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
        style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}
        suppressHydrationWarning
      >
        {value}
      </p>
      {sub && <p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Quick action link ────────────────────────────────────────────────────────

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link href={href} className={buttonVariants({ variant: "outline" })}>
      <Icon className="mr-2 size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DayAtAGlance({
  revenue,
  closedCount,
  initialOpenCount,
  isDayOpen,
}: DayAtAGlanceProps) {
  const t = useTranslations("dayAtAGlance");
  const [openCount, setOpenCount] = useState(initialOpenCount);
  const [, startTransition] = useTransition();

  const refreshCount = useCallback(() => {
    startTransition(async () => {
      const result = await listOpenTickets();
      if (result.success) setOpenCount(result.data.length);
    });
  }, []);

  useRealtimeEvent("cashier", "ticket_created", { onData: refreshCount, onPoll: refreshCount });
  useRealtimeEvent("cashier", "ticket_updated", { onData: refreshCount, onPoll: refreshCount });

  if (!isDayOpen) {
    return (
      <EmptyState
        icon={CalendarCheckIcon}
        title={t("noDayOpenTitle")}
        description={t("noDayOpenDescription")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUpIcon}
          label={t("revenueToday")}
          value={`$${revenue.toLocaleString("es-CO")}`}
          sub={t("revenueSubOpen")}
          accent={revenue > 0}
        />
        <StatCard
          icon={TicketIcon}
          label={t("openTickets")}
          value={String(openCount)}
          sub={t("openTicketsSub")}
        />
        <StatCard
          icon={CheckCircleIcon}
          label={t("closedTickets")}
          value={String(closedCount)}
          sub={t("closedTicketsSub")}
        />
      </div>

      {/* Quick actions */}
      <div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <span className="font-serif italic text-primary">§ </span>
          {t("quickActions")}
        </p>
        <div className="flex flex-wrap gap-2">
          <QuickAction
            href="/cashier/tickets/history"
            icon={ReceiptIcon}
            label={t("actionHistory")}
          />
          <QuickAction href="/admin/employees" icon={UsersIcon} label={t("actionEmployees")} />
          <QuickAction href="/admin/catalog" icon={BookOpenIcon} label={t("actionCatalog")} />
          <QuickAction href="/admin/payroll" icon={TrendingUpIcon} label={t("actionPayroll")} />
        </div>
      </div>
    </div>
  );
}
