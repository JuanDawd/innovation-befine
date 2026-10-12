"use client";

/**
 * AppointmentList — T052
 *
 * Day-view appointment list with date navigation and stylist filter.
 * Used by secretary and admin.
 */

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyDataChanged } from "@/lib/data-events";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "@/lib/action-query";
import { useTranslations } from "next-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlusIcon,
  TriangleAlertIcon,
  CalendarDaysIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookAppointmentForm } from "@/components/book-appointment-form";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listAppointmentsForDate,
  listBookingStylists,
  acknowledgeAppointmentPriceChange,
  type AppointmentListRow,
} from "@/app/(protected)/appointments/actions";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";

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
    <div className="flex items-center gap-1 mt-0.5">
      <TriangleAlertIcon className="size-3 text-status-attention-foreground shrink-0" aria-hidden />
      <span className="text-xs text-status-attention-foreground">{t("priceChangedBadge")}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-1.5 text-xs text-status-attention-foreground hover:bg-status-attention"
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

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppointmentList() {
  const t = useTranslations("appointments");
  const tc = useTranslations("common");

  const [date, setDate] = useState(todayBogota);
  const [bookOpen, setBookOpen] = useState(false);
  const [stylistFilter, setStylistFilter] = useState("");
  const { data: stylists = [] } = useQuery({
    queryKey: queryKeys.staff.bookingStylists,
    queryFn: () => unwrap(listBookingStylists()),
    staleTime: 5 * 60_000,
  });
  const {
    data: rows = [],
    isPending: isLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.appointments.byDate(date, stylistFilter),
    queryFn: () => unwrap(listAppointmentsForDate(date, stylistFilter || undefined)),
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

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t("prevDay")} onClick={prev}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring"
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

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2Icon className="size-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive py-4">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">{t("colTime")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colClient")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colStylist")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colService")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colStatus")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const clientDisplay = row.clientName ?? row.guestName ?? "—";
                const showPriceAlert =
                  !row.priceChangeAcknowledged &&
                  (row.status === "booked" || row.status === "confirmed");
                return (
                  <tr
                    key={row.id}
                    className={`border-t hover:bg-muted/30 transition-colors${showPriceAlert ? " bg-status-attention" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                      {formatTime(row.scheduledAt)}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {row.durationMinutes}min
                      </span>
                    </td>
                    <td className="px-3 py-2">{clientDisplay}</td>
                    <td className="px-3 py-2">{row.stylistName}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <span className="truncate block">{row.serviceSummary}</span>
                      {showPriceAlert && (
                        <PriceChangedAcknowledge
                          appointmentId={row.id}
                          t={t}
                          onAcknowledged={() => patchRow(row.id, { priceChangeAcknowledged: true })}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} label={t(`status.${row.status}`)} />
                    </td>
                    <td className="px-3 py-2">
                      <AppointmentStatusActions
                        appointmentId={row.id}
                        currentStatus={row.status}
                        onUpdated={(newStatus) => patchRow(row.id, { status: newStatus })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
