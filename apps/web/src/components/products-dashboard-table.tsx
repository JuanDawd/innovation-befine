"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type LucideIcon, Loader2Icon, PackageIcon, ClockIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductStatusBadge, type ProductStatusKey } from "@/components/ui/product-status-badge";
import { ProductProgressBar } from "@/components/ui/product-progress-bar";
import type { ProductDashboardRow } from "@befine/db";
import { getProductsDashboardData } from "@/app/(protected)/products/actions";

function deriveProductStatus(row: ProductDashboardRow): ProductStatusKey {
  if (row.totalPieces === 0 || row.approvedPieces === 0) {
    if (row.pendingPieces > 0) return "not_started";
    return "not_started";
  }
  if (row.approvedPieces >= row.totalPieces) return "all_approved";
  if (row.pendingPieces < row.totalPieces - row.approvedPieces) return "pending_approval";
  return "in_progress";
}

function DashboardSection({
  rows,
  isAdmin,
  title,
  emptyText,
  icon,
}: {
  rows: ProductDashboardRow[];
  isAdmin: boolean;
  title: string;
  emptyText: string;
  icon: LucideIcon;
}) {
  const t = useTranslations("products");
  const detailBase = isAdmin ? "/admin/products" : "/secretary/products";

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState icon={icon} title={emptyText} className="py-8" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">{t("colStatus")}</th>
                <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">
                  {t("colAssigned")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium">{t("colQuantity")}</th>
                <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">
                  {t("colLargeOrder")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium">{t("colProgress")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("colDetail")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const statusKey = deriveProductStatus(row);
                const assigned =
                  row.assignedEmployeeNames.length > 0
                    ? row.assignedEmployeeNames.join(", ")
                    : t("noAssigned");

                return (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <ProductStatusBadge status={statusKey} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell max-w-[160px] truncate">
                      {assigned}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {row.totalPieces}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell max-w-[180px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground truncate">
                          {row.largeOrderClientName ?? t("noOrder")}
                        </span>
                        {row.source === "large_order" &&
                          row.unassignedQuantity > 0 &&
                          row.largeOrderId && (
                            <Link
                              href={`/large-orders/${row.largeOrderId}#produccion`}
                              className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              {row.unassignedQuantity} uds. sin asignar
                            </Link>
                          )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {row.approvedPieces}/{row.totalPieces}
                        </span>
                        <ProductProgressBar pct={row.progressPct} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`${detailBase}/${row.id}`}
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {t("viewDetail")}
                      </Link>
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

export function ProductsDashboardTable({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("products");
  const [rows, setRows] = useState<ProductDashboardRow[]>([]);
  const [isLoading, startLoad] = useTransition();

  const load = useCallback(() => {
    startLoad(async () => {
      const res = await getProductsDashboardData();
      if (res.success) setRows(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading && rows.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        {t("pageTitle")}
      </div>
    );
  }

  const todayRows = rows.filter((r) => r.section === "today");
  const wipRows = rows.filter((r) => r.section === "wip");

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection
        rows={todayRows}
        isAdmin={isAdmin}
        title={t("dashboardTodayTitle")}
        emptyText={t("dashboardEmptyToday")}
        icon={PackageIcon}
      />
      <DashboardSection
        rows={wipRows}
        isAdmin={isAdmin}
        title={t("dashboardWipTitle")}
        emptyText={t("dashboardEmptyWip")}
        icon={ClockIcon}
      />
    </div>
  );
}
