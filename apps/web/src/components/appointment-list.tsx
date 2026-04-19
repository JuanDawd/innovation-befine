"use client";

/**
 * AppointmentList — T052
 *
 * Day-view appointment list with date navigation and stylist filter.
 * Used by secretary and cashier_admin.
 */

import { useState, useTransition, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  listAppointmentsForDate,
  listBookingStylists,
  acknowledgeAppointmentPriceChange,
  type AppointmentListRow,
  type StylistOption,
} from "@/app/(protected)/appointments/actions";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";

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
      <TriangleAlertIcon className="h-3 w-3 text-amber-600 shrink-0" aria-hidden />
      <span className="text-xs text-amber-700 dark:text-amber-400">{t("priceChangedBadge")}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-1.5 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100"
        onClick={acknowledge}
        disabled={isPending}
        aria-label={t("acknowledgeAction")}
      >
        {isPending ? <Loader2Icon className="h-3 w-3 animate-spin" /> : t("acknowledgeAction")}
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

const STATUS_BADGE: Record<AppointmentListRow["status"], { label: string; className: string }> = {
  booked: {
    label: "Reservada",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  confirmed: {
    label: "Confirmada",
    className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  completed: {
    label: "Completada",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  },
  cancelled: {
    label: "Cancelada",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  rescheduled: {
    label: "Reprogramada",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  no_show: {
    label: "No asistió",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
};

export function AppointmentList({ newHref }: { newHref: string }) {
  const t = useTranslations("appointments");
  const tc = useTranslations("common");
  const router = useRouter();

  const [date, setDate] = useState(todayBogota);
  const [stylistFilter, setStylistFilter] = useState("");
  const [stylists, setStylists] = useState<StylistOption[]>([]);
  const [rows, setRows] = useState<AppointmentListRow[]>([]);
  const [isLoading, startLoadTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((d: string, sid: string) => {
    startLoadTransition(async () => {
      const res = await listAppointmentsForDate(d, sid || undefined);
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setError(null);
      setRows(res.data);
    });
  }, []);

  // Load stylists once on mount
  useEffect(() => {
    listBookingStylists().then((res) => {
      if (res.success) setStylists(res.data);
    });
  }, []);

  // Reload appointments when date or filter changes
  useEffect(() => {
    load(date, stylistFilter);
  }, [date, stylistFilter, load]);

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
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring"
            aria-label={t("selectDate")}
          />
          <Button variant="outline" size="icon" aria-label={t("nextDay")} onClick={next}>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setDate(todayBogota())}>
              {t("today")}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stylist filter */}
          <select
            aria-label={t("filterByStylist")}
            value={stylistFilter}
            onChange={(e) => setStylistFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring"
          >
            <option value="">{t("allStylists")}</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* New appointment */}
          <Button size="sm" onClick={() => router.push(newHref)}>
            <PlusIcon className="h-4 w-4 mr-1" />
            {t("bookAppointment")}
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive py-4">{error}</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm font-medium">{t("emptyTitle")}</p>
          <p className="text-sm mt-1">{t("emptyDescription")}</p>
        </div>
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
                const badge = STATUS_BADGE[row.status];
                const clientDisplay = row.clientName ?? row.guestName ?? "—";
                const showPriceAlert =
                  !row.priceChangeAcknowledged &&
                  (row.status === "booked" || row.status === "confirmed");
                return (
                  <tr
                    key={row.id}
                    className={`border-t hover:bg-muted/30 transition-colors${showPriceAlert ? " bg-amber-50 dark:bg-amber-950/20" : ""}`}
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
                          onAcknowledged={() =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, priceChangeAcknowledged: true } : r,
                              ),
                            )
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <AppointmentStatusActions
                        appointmentId={row.id}
                        currentStatus={row.status}
                        onUpdated={(newStatus) =>
                          setRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)),
                          )
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
