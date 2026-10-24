"use client";

/**
 * AppointmentList — T052
 *
 * Day agenda with date navigation and stylist filter — one row per
 * appointment (time, client, stylist · service, status, next step), a "now"
 * marker on today, the same layout on desktop and phone.
 * Used by secretary and admin.
 */

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyDataChanged } from "@/lib/data-events";
import { queryKeys } from "@/lib/query-keys";
import { useFormatter, useTranslations } from "next-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlusIcon,
  TriangleAlertIcon,
  CalendarDaysIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookAppointmentForm } from "@/components/book-appointment-form";
import { EmptyState } from "@/components/ui/empty-state";
import {
  acknowledgeAppointmentPriceChange,
  type AppointmentListRow,
} from "@/app/(protected)/appointments/actions";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { hasStarted } from "@/lib/appointment-timing";
import { StatusBadge } from "@/components/ui/status-badge";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { fetchQuery } from "@/lib/action-query";
import { cn } from "@/lib/utils";

// ─── Price change acknowledge inline widget (T109) ────────────────────────────

function PriceChangedAcknowledge({
  appointmentId,
  t,
  onAcknowledged,
}: {
  appointmentId: string;
  t: ReturnType<typeof useTranslations<"appointments">>;
  onAcknowledged: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function acknowledge() {
    startTransition(async () => {
      await acknowledgeAppointmentPriceChange(appointmentId);
      onAcknowledged();
    });
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <TriangleAlertIcon className="size-3 text-status-attention-foreground shrink-0" aria-hidden />
      <span className="text-xs text-status-attention-foreground">{t("priceChangedBadge")}</span>
      <Button
        size="xs"
        variant="outline"
        className="text-status-attention-foreground"
        onClick={acknowledge}
        disabled={isPending}
        aria-label={t("acknowledgeAction")}
      >
        {isPending ? <Loader2Icon className="size-3 animate-spin" /> : t("acknowledgeAction")}
      </Button>
    </div>
  );
}

function todayBogota(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AppointmentList() {
  const t = useTranslations("appointments");
  const format = useFormatter();
  const formatTime = (date: Date) =>
    format.dateTime(new Date(date), {
      timeZone: "America/Bogota",
      hour: "numeric",
      minute: "2-digit",
    });

  // Date and stylist live in the URL (?date=YYYY-MM-DD&stylist=<id>) — survive refresh, shareable.
  const [date, setDate] = useSearchParamState("date", todayBogota(), (raw) =>
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null,
  );
  const [bookOpen, setBookOpen] = useState(false);
  const [stylistFilter, setStylistFilter] = useSearchParamState("stylist", "", (raw) =>
    /^[0-9a-f-]{36}$/i.test(raw) ? raw : null,
  );
  const { data: stylists = [] } = useQuery({
    queryKey: queryKeys.staff.bookingStylists,
    queryFn: () => fetchQuery("bookingStylists"),
    staleTime: 5 * 60_000,
  });
  const {
    data: rows = [],
    isPending: isLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.appointments.byDate(date, stylistFilter),
    queryFn: () => fetchQuery("appointmentsForDate", { date, stylist: stylistFilter }),
    refetchInterval: 60_000,
  });
  const error = queryError?.message ?? null;

  const queryClient = useQueryClient();
  /** Instant local patch of one row, then refetch (status changes can move/hide rows). */
  function patchRow(id: string, patch: Partial<AppointmentListRow>) {
    queryClient.setQueryData<AppointmentListRow[]>(
      queryKeys.appointments.byDate(date, stylistFilter),
      (prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    notifyDataChanged("appointments");
  }

  function prev() {
    const d = shiftDate(date, -1);
    setDate(d);
  }

  function next() {
    const d = shiftDate(date, 1);
    setDate(d);
  }

  const isToday = date === todayBogota();
  // On today's agenda, a "now" marker goes before the first appointment still ahead.
  const nowIndex = isToday ? rows.findIndex((r) => !hasStarted(r.scheduledAt)) : -1;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t("prevDay")} onClick={prev}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-auto"
            aria-label={t("selectDate")}
          />
          <Button variant="outline" size="icon" aria-label={t("nextDay")} onClick={next}>
            <ChevronRightIcon className="size-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setDate(todayBogota())}>
              {t("today")}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stylist filter */}
          <NativeSelect
            aria-label={t("filterByStylist")}
            value={stylistFilter}
            onChange={(e) => setStylistFilter(e.target.value)}
            selectClassName="h-9 text-sm"
          >
            <option value="">{t("allStylists")}</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>

          {/* New appointment */}
          <Button size="sm" onClick={() => setBookOpen(true)}>
            <PlusIcon className="size-4 mr-1" />
            {t("bookAppointment")}
          </Button>
        </div>
      </div>

      {/* Agenda */}
      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive py-4" role="alert">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
          {rows.map((row, index) => {
            const clientDisplay = row.clientName ?? row.guestName ?? "—";
            const showPriceAlert =
              !row.priceChangeAcknowledged &&
              (row.status === "booked" || row.status === "confirmed");
            const closed =
              row.status === "completed" ||
              row.status === "cancelled" ||
              row.status === "rescheduled";
            return (
              <li
                key={row.id}
                className={cn(
                  "relative grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 px-3.5 py-3 sm:grid-cols-[5.5rem_1fr_auto] sm:items-center",
                  showPriceAlert && "bg-status-attention/40",
                  closed && "text-muted-foreground",
                )}
              >
                {index === nowIndex && (
                  <span
                    className="absolute inset-x-0 -top-px flex items-center gap-2 text-xs font-medium text-primary"
                    aria-hidden="true"
                  >
                    <span className="h-0.5 flex-1 bg-primary" />
                  </span>
                )}
                {index === nowIndex && <span className="sr-only">{t("nowMarker")}</span>}
                <p className="tabular-nums">
                  <span className="block text-sm font-semibold text-foreground">
                    {formatTime(row.scheduledAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("durationShort", { minutes: row.durationMinutes })}
                  </span>
                </p>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">
                      {clientDisplay}
                    </p>
                    <StatusBadge status={row.status} label={t(`status.${row.status}`)} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.stylistName} · {row.serviceSummary}
                  </p>
                  {showPriceAlert && (
                    <PriceChangedAcknowledge
                      appointmentId={row.id}
                      t={t}
                      onAcknowledged={() => patchRow(row.id, { priceChangeAcknowledged: true })}
                    />
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <AppointmentStatusActions
                    appointmentId={row.id}
                    currentStatus={row.status}
                    clientName={clientDisplay}
                    scheduledAt={row.scheduledAt}
                    onUpdated={(newStatus) => patchRow(row.id, { status: newStatus })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("bookAppointment")}</DialogTitle>
          </DialogHeader>
          {bookOpen && <BookAppointmentForm redirectPath="" onClose={() => setBookOpen(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
