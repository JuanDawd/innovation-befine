"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShoppingBagIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { LargeOrderListRow } from "./actions";

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
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:border-ring"
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
        </select>
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
              <th className="px-4 py-2 text-left font-medium">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((order) => (
              <tr key={order.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{order.clientName}</td>
                <td className="px-4 py-2 max-w-[200px] truncate text-muted-foreground">
                  {order.description}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  ${order.totalPrice.toLocaleString("es-CO")}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  <span
                    className={
                      order.balanceDue > 0 &&
                      (order.status === "delivered" || order.status === "ready")
                        ? "text-amber-600 dark:text-amber-400 font-semibold"
                        : order.balanceDue === 0
                          ? "text-green-600 dark:text-green-400"
                          : ""
                    }
                  >
                    ${order.balanceDue.toLocaleString("es-CO")}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={order.status} />
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
                <td className="px-4 py-2">
                  <Link
                    href={`/large-orders/${order.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {t("viewDetail")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
