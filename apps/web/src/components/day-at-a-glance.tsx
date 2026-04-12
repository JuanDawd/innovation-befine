"use client";

/**
 * DayAtAGlance — T093
 *
 * Admin home stats panel: revenue today, open ticket count (live), quick actions.
 * Receives initial values as props; open ticket count updates via realtime events.
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
  AlertCircleIcon,
} from "lucide-react";
import { useRealtimeEvent } from "@befine/realtime/client";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { listOpenTickets } from "@/app/(protected)/tickets/actions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DayAtAGlanceProps {
  revenue: number;
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
        "rounded-xl border bg-card p-5 shadow-sm flex flex-col gap-3",
        accent && "border-primary/20 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono tabular-nums" suppressHydrationWarning>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Quick action link ────────────────────────────────────────────────────────

function QuickAction({
  href,
  icon: Icon,
  label,
  disabled,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        className={cn(
          buttonVariants({ variant: "outline" }),
          "opacity-40 cursor-not-allowed pointer-events-none",
        )}
        aria-disabled="true"
      >
        <Icon className="mr-2 size-4" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={buttonVariants({ variant: "outline" })}>
      <Icon className="mr-2 size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DayAtAGlance({ revenue, initialOpenCount, isDayOpen }: DayAtAGlanceProps) {
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

  return (
    <div className="flex flex-col gap-6">
      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={TrendingUpIcon}
          label={t("revenueToday")}
          value={`$${revenue.toLocaleString("es-CO")}`}
          sub={isDayOpen ? t("revenueSubOpen") : t("revenueSubClosed")}
          accent={revenue > 0}
        />
        <StatCard
          icon={TicketIcon}
          label={t("openTickets")}
          value={String(openCount)}
          sub={isDayOpen ? t("openTicketsSub") : t("dayClosedSub")}
        />
        {/* Unsettled earnings stub — wired in T070 */}
        <div className="rounded-xl border bg-card p-5 shadow-sm flex flex-col gap-3 opacity-60">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircleIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {t("unsettledEarnings")}
            </span>
          </div>
          <p className="text-2xl font-bold text-muted-foreground">—</p>
          <p className="text-xs text-muted-foreground">{t("unsettledEarningsSub")}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
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
          {/* Payroll — wired in T067 */}
          <QuickAction
            href="/admin/payroll"
            icon={TrendingUpIcon}
            label={t("actionPayroll")}
            disabled
          />
        </div>
      </div>
    </div>
  );
}
