"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, ShoppingBagIcon } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { LargeOrderListRow } from "./actions";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/i18n";
import { cn } from "@/lib/utils";

type Props = { orders: LargeOrderListRow[] };

const STATUS_OPTIONS = [
  "pending",
  "in_production",
  "ready",
  "delivered",
  "paid_in_full",
  "cancelled",
] as const;

/** Balance still owed on a ready/delivered order is the one to chase. */
function balanceClass(order: LargeOrderListRow): string {
  if (order.balanceDue > 0 && (order.status === "delivered" || order.status === "ready"))
    return "font-semibold text-status-attention-foreground";
  if (order.balanceDue === 0) return "text-status-success-foreground";
  return "";
}

function formatEta(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function LargeOrdersTable({ orders }: Props) {
  const t = useTranslations("largeOrders");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const filtered = statusFilter ? orders.filter((o) => o.status === statusFilter) : orders;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBagIcon}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <NativeSelect
          selectClassName="text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t("filterByStatus")}
        >
          <option value="">{t("allStatuses")}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </NativeSelect>
      </div>

      {/* Below desktop width: one card per order, the whole card opens it */}
      <ul className="grid gap-2.5 md:grid-cols-2 xl:hidden">
        {filtered.map((order) => (
          <li key={order.id}>
            <Link
              href={`/large-orders/${order.id}`}
              className="block rounded-xl border bg-card px-3.5 py-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold">{order.clientName}</p>
                <StatusBadge
                  status={order.status}
                  label={t(`status_${order.status}` as Parameters<typeof t>[0])}
                />
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{order.description}</p>
              <div className="mt-2.5 flex items-end justify-between gap-3 text-xs text-muted-foreground">
                <span>{formatEta(order.estimatedDeliveryAt)}</span>
                <span className="text-right">
                  <span className="block font-mono text-base font-medium text-foreground tabular-nums">
                    {formatMoney(order.totalPrice)}
                  </span>
                  <span className={cn("font-mono tabular-nums", balanceClass(order))}>
                    {t("colBalance")} {formatMoney(order.balanceDue)}
                  </span>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border xl:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{t("colClient")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("colDescription")}</th>
              <th className="px-4 py-2 text-right font-medium font-mono">{t("colTotal")}</th>
              <th className="px-4 py-2 text-right font-medium font-mono">{t("colBalance")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("colStatus")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("colETA")}</th>
              <th className="w-10 px-2 py-2">
                <span className="sr-only">{t("colActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((order) => (
              <tr key={order.id} className="group relative hover:bg-muted/40">
                <td className="px-4 py-2.5 font-medium">
                  {/* Stretched link: the whole row opens the order */}
                  <Link
                    href={`/large-orders/${order.id}`}
                    className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                  >
                    {order.clientName}
                  </Link>
                </td>
                <td className="px-4 py-2 max-w-50 truncate text-muted-foreground">
                  {order.description}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {formatMoney(order.totalPrice)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  <span className={balanceClass(order)}>{formatMoney(order.balanceDue)}</span>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge
                    status={order.status}
                    label={t(`status_${order.status}` as Parameters<typeof t>[0])}
                  />
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  {formatEta(order.estimatedDeliveryAt)}
                </td>
                <td className="px-2 py-2 text-muted-foreground" aria-hidden="true">
                  <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
