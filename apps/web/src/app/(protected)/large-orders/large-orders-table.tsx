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

type Props = { orders: LargeOrderListRow[] };

const STATUS_OPTIONS = [
  "pending",
  "in_production",
  "ready",
  "delivered",
  "paid_in_full",
  "cancelled",
] as const;

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

      <div className="rounded-md border overflow-x-auto">
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
                  <span
                    className={
                      order.balanceDue > 0 &&
                      (order.status === "delivered" || order.status === "ready")
                        ? "text-status-attention-foreground font-semibold"
                        : order.balanceDue === 0
                          ? "text-status-success-foreground"
                          : ""
                    }
                  >
                    {formatMoney(order.balanceDue)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge
                    status={order.status}
                    label={t(`status_${order.status}` as Parameters<typeof t>[0])}
                  />
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  {order.estimatedDeliveryAt
                    ? new Date(order.estimatedDeliveryAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
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
