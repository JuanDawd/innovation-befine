"use client";

/**
 * Business day header controls — T019
 *
 * - BusinessDayStatusBadge / BusinessDayStatusLine: status badge and one line
 *   (date, opening time, or a warning when the day has been left open
 *   overnight). They live in PageHeader.
 * - BusinessDayActions: Open day / Close day / Reopen last closed day.
 *
 * Closing (H-49): the dialog never offers a confirmable state before it knows
 * how many tickets are still unpaid. It refetches the shared `tickets.open`
 * and `businessDay.stats` queries on open and keeps confirm disabled until
 * both settle. With unpaid tickets, the primary action is "go charge them".
 *
 * Client components driven by server data (passed as props).
 * After each mutation the server revalidates and Next.js re-renders the page.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CalendarCheckIcon,
  CalendarXIcon,
  Loader2Icon,
  RotateCcwIcon,
} from "lucide-react";
import { notifyDataChanged } from "@/lib/data-events";
import { queryKeys } from "@/lib/query-keys";
import { fetchQuery } from "@/lib/action-query";
import { formatMoney } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { daysSince } from "@/components/cashier-dashboard-helpers";
import type { BusinessDay } from "@/lib/business-day";
import {
  openBusinessDay,
  closeBusinessDay,
  reopenBusinessDay,
} from "@/app/(protected)/cashier/actions/business-day";

const TZ = "America/Bogota";

interface BusinessDayProps {
  currentDay: BusinessDay | null;
  lastClosedDay: BusinessDay | null;
}

// ─── Status (PageHeader meta + description) ──────────────────────────────────

export function BusinessDayStatusBadge({ currentDay }: Pick<BusinessDayProps, "currentDay">) {
  const t = useTranslations("businessDay");
  return currentDay ? (
    <StatusBadge status="success" label={t("dayOpen")} />
  ) : (
    <StatusBadge status="initial" label={t("dayClosed")} />
  );
}

export function BusinessDayStatusLine({ currentDay, lastClosedDay }: BusinessDayProps) {
  const t = useTranslations("businessDay");
  const today = new Date().toLocaleDateString("es-CO", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  if (!currentDay) {
    return (
      <span suppressHydrationWarning>
        {todayLabel}
        {lastClosedDay?.closedAt &&
          ` · ${t("lastClosedAt", {
            date: new Date(lastClosedDay.closedAt).toLocaleString("es-CO", {
              timeZone: TZ,
              dateStyle: "short",
              timeStyle: "short",
            }),
          })}`}
      </span>
    );
  }

  const openedAt = new Date(currentDay.openedAt);
  const days = daysSince(openedAt);
  if (days >= 1) {
    return (
      <span className="flex flex-wrap items-center gap-x-1.5" suppressHydrationWarning>
        <span>
          {t("openSince", {
            date: openedAt.toLocaleDateString("es-CO", {
              timeZone: TZ,
              day: "numeric",
              month: "short",
            }),
          })}
        </span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1 font-medium text-status-attention-foreground">
          <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {t("staleDay", { days })}
        </span>
      </span>
    );
  }

  return (
    <span suppressHydrationWarning>
      {todayLabel} ·{" "}
      {t("openedAt", {
        time: openedAt.toLocaleTimeString("es-CO", {
          timeZone: TZ,
          hour: "2-digit",
          minute: "2-digit",
        }),
      })}
    </span>
  );
}

// ─── Close-day dialog ────────────────────────────────────────────────────────

type CloseSummary = { revenue: number; closedCount: number };

function CloseDayDialog({
  disabled,
  onClose,
}: {
  disabled: boolean;
  onClose: (summary: CloseSummary) => void;
}) {
  const t = useTranslations("businessDay");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  // Same cached queries the board and summary strip use; refetched on open.
  const tickets = useQuery({
    queryKey: queryKeys.tickets.open,
    queryFn: () => fetchQuery("openTickets"),
    enabled: false,
  });
  const stats = useQuery({
    queryKey: queryKeys.businessDay.stats,
    queryFn: () => fetchQuery("dayStats"),
    enabled: false,
  });

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setChecking(true);
    await Promise.all([tickets.refetch(), stats.refetch()]);
    setChecking(false);
  }

  const failed = !checking && (tickets.isError || stats.isError);
  const known = !checking && !failed && tickets.data !== undefined && stats.data !== undefined;
  const openCount = tickets.data?.length ?? 0;
  const revenue = stats.data?.revenue ?? 0;
  const closedCount = stats.data?.closedCount ?? 0;

  function confirmClose() {
    setOpen(false);
    onClose({ revenue, closedCount });
  }

  function goCharge() {
    setOpen(false);
    router.push("/cashier/checkout", { scroll: false });
  }

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        disabled={disabled}
        onClick={() => void handleOpenChange(true)}
        className="pointer-coarse:h-11"
      >
        {disabled ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <CalendarXIcon aria-hidden="true" />
        )}
        {t("close")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => void handleOpenChange(next)}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("confirmClose")}</DialogTitle>
            <DialogDescription>{t("confirmCloseDescription")}</DialogDescription>
          </DialogHeader>

          <div aria-live="polite" className="flex flex-col gap-3">
            {checking && (
              <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                {t("closeChecking")}
              </p>
            )}
            {failed && (
              <p
                className="flex items-start gap-2 rounded-lg bg-status-negative px-3 py-2.5 text-sm text-status-negative-foreground"
                role="alert"
              >
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("closeError")}
              </p>
            )}
            {known && (
              <>
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
                  {[
                    [t("summaryRevenue"), formatMoney(revenue)],
                    [t("summaryClosed"), String(closedCount)],
                    [t("summaryOpen"), String(openCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-1 bg-card px-2 py-3">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="font-mono text-sm font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                {openCount > 0 && (
                  <p className="flex items-start gap-2 rounded-lg bg-status-attention px-3 py-2.5 text-sm text-status-attention-foreground">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t("closeOpenTicketsWarning", { count: openCount })}
                  </p>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tCommon("cancel")}</DialogClose>
            {known && openCount > 0 ? (
              <>
                <Button variant="destructive" onClick={confirmClose}>
                  {t("closeAnyway")}
                </Button>
                <Button onClick={goCharge}>{t("goCharge", { count: openCount })}</Button>
              </>
            ) : (
              <Button onClick={confirmClose} disabled={!known}>
                {t("close")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export function BusinessDayActions({ currentDay, lastClosedDay }: BusinessDayProps) {
  const router = useRouter();
  const t = useTranslations("businessDay");
  const tCommon = useTranslations("common");

  const [isPending, startTransition] = useTransition();

  // Reopen dialog state
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonError, setReopenReasonError] = useState<string | null>(null);

  function handleOpen() {
    startTransition(async () => {
      const result = await openBusinessDay();
      if (result.success) {
        toast.success(t("openSuccess"));
        notifyDataChanged("businessDay", "tickets");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleClose(summary: CloseSummary) {
    if (!currentDay) return;
    startTransition(async () => {
      const result = await closeBusinessDay(currentDay.id);
      if (result.success) {
        toast.success(
          t("closeSuccessSummary", {
            revenue: formatMoney(summary.revenue),
            count: summary.closedCount,
          }),
        );
        notifyDataChanged("businessDay", "tickets");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleReopenSubmit() {
    if (reopenReason.trim().length < 5) {
      setReopenReasonError(t("reopenReasonTooShort"));
      return;
    }
    setReopenReasonError(null);
    startTransition(async () => {
      const result = await reopenBusinessDay({ reason: reopenReason });
      if (result.success) {
        toast.success(t("reopenSuccess"));
        notifyDataChanged("businessDay", "tickets");
        router.refresh();
        setReopenOpen(false);
        setReopenReason("");
      } else {
        if (result.error.details) {
          setReopenReasonError(result.error.details[0]?.message ?? result.error.message);
        } else {
          toast.error(result.error.message);
          setReopenOpen(false);
        }
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentDay ? (
        <CloseDayDialog disabled={isPending} onClose={handleClose} />
      ) : (
        <>
          {lastClosedDay && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => setReopenOpen(true)}
              disabled={isPending}
              className="pointer-coarse:h-11"
            >
              <RotateCcwIcon aria-hidden="true" />
              {t("reopen")}
            </Button>
          )}
          <Button
            size="lg"
            onClick={handleOpen}
            disabled={isPending}
            className="pointer-coarse:h-11"
          >
            {isPending ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <CalendarCheckIcon aria-hidden="true" />
            )}
            {t("open")}
          </Button>
        </>
      )}

      {/* Reopen dialog with reason field */}
      <Dialog
        open={reopenOpen}
        onOpenChange={(open) => {
          setReopenOpen(open);
          if (!open) {
            setReopenReason("");
            setReopenReasonError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmReopen")}</DialogTitle>
            <DialogDescription>{t("confirmReopenDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="reopen-reason" className="text-sm font-medium">
              {t("reopenReason")}
            </label>
            <Input
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder={t("reopenReasonPlaceholder")}
              aria-describedby={reopenReasonError ? "reopen-reason-error" : undefined}
              aria-invalid={!!reopenReasonError}
              disabled={isPending}
            />
            {reopenReasonError && (
              <p id="reopen-reason-error" className="text-sm text-destructive">
                {reopenReasonError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleReopenSubmit} disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              {t("reopen")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
