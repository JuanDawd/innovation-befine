"use client";

/**
 * Front-desk panels for the secretary home: what needs her next — the day's
 * remaining appointments (with their one-tap next step), units waiting for
 * review in Producción, and pedidos due soon. Each links to its full screen.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRightIcon } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { fetchQuery } from "@/lib/action-query";
import { notifyDataChanged } from "@/lib/data-events";
import { todayInBogota } from "@/lib/dates";
import { formatDate, formatMoney } from "@/i18n";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/loading-skeleton";
import type { PedidoListItem } from "@befine/db";

const BOGOTA = "America/Bogota";

function PanelHeading({
  id,
  title,
  href,
  linkLabel,
}: {
  id: string;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <Link
        href={href}
        className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline md:min-h-0"
      >
        {linkLabel}
        <ArrowRightIcon className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Today's appointments still to happen, soonest first, with their next step. */
export function UpcomingAppointmentsPanel() {
  const t = useTranslations("frontDesk");
  const tAppt = useTranslations("appointments");
  const format = useFormatter();
  const today = todayInBogota();

  const { data: rows = [], isPending } = useQuery({
    queryKey: queryKeys.appointments.byDate(today, ""),
    queryFn: () => fetchQuery("appointmentsForDate", { date: today, stylist: "" }),
    refetchInterval: 60_000,
  });
  const upcoming = rows
    .filter((r) => r.status === "booked" || r.status === "confirmed")
    .slice(0, 6);

  return (
    <section aria-labelledby="fd-appointments" className="flex flex-col gap-2">
      <PanelHeading
        id="fd-appointments"
        title={t("upcomingTitle")}
        href="/secretary/appointments"
        linkLabel={t("openAgenda")}
      />
      {isPending ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noUpcoming")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
          {upcoming.map((row) => {
            const client = row.clientName ?? row.guestName ?? "—";
            return (
              <li
                key={row.id}
                className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-2 px-3.5 py-3 sm:grid-cols-[4.5rem_1fr_auto] sm:items-center"
              >
                <p className="text-sm font-semibold tabular-nums">
                  {format.dateTime(new Date(row.scheduledAt), {
                    timeZone: BOGOTA,
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 truncate text-sm font-medium">{client}</p>
                    <StatusBadge status={row.status} label={tAppt(`status.${row.status}`)} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.stylistName} · {row.serviceSummary}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <AppointmentStatusActions
                    appointmentId={row.id}
                    currentStatus={row.status}
                    clientName={client}
                    scheduledAt={row.scheduledAt}
                    onUpdated={() => notifyDataChanged("appointments")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** How many reported units wait for review in Producción (T134). */
export function ApprovalsWaitingPanel() {
  const t = useTranslations("frontDesk");
  const { data: board, isPending } = useQuery({
    queryKey: queryKeys.pedidos.productionBoard,
    queryFn: () => fetchQuery("productionBoard"),
    refetchInterval: 60_000,
  });

  if (isPending) return <Skeleton className="h-16 w-full rounded-xl" />;
  const pending = board?.queue.reduce((n, g) => n + g.pending, 0) ?? 0;

  return (
    <Link
      href="/produccion"
      className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{t("approvalsTitle")}</span>
        <span className="block text-xs text-muted-foreground">
          {pending === 0 ? t("approvalsNone") : t("approvalsHint")}
        </span>
      </span>
      <span
        className={
          pending > 0
            ? "rounded-full bg-status-attention px-2.5 py-0.5 text-sm font-semibold tabular-nums text-status-attention-foreground"
            : "text-sm tabular-nums text-muted-foreground"
        }
      >
        {pending}
      </span>
    </Link>
  );
}

/** Pedidos ready to hand over or due within a week (T134). */
export function OrdersDuePanel({ orders }: { orders: PedidoListItem[] }) {
  const t = useTranslations("frontDesk");
  const tStatus = useTranslations("pedidos.status");

  return (
    <section aria-labelledby="fd-orders" className="flex flex-col gap-2">
      <PanelHeading
        id="fd-orders"
        title={t("ordersTitle")}
        href="/pedidos"
        linkLabel={t("openOrders")}
      />
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ordersNone")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/pedidos/${order.id}`}
                className="flex flex-col gap-0.5 px-3.5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    #{String(order.number).padStart(4, "0")} {order.clientName}
                  </span>
                  <StatusBadge status={order.status} label={tStatus(order.status)} />
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {order.estimatedDeliveryDate &&
                    t("dueOn", {
                      date: formatDate(
                        `${order.estimatedDeliveryDate}T12:00:00-05:00`,
                        "es",
                        "EEE d MMM",
                      ),
                    })}
                  {order.balance > 0 && (
                    <>
                      {order.estimatedDeliveryDate && " · "}
                      {t("balance")}{" "}
                      <span className="font-mono tabular-nums">{formatMoney(order.balance)}</span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
