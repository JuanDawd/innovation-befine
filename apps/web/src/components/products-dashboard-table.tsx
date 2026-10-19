"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  type LucideIcon,
  ChevronRightIcon,
  Loader2Icon,
  PackageIcon,
  ClockIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductStatusBadge, type ProductStatusKey } from "@/components/ui/product-status-badge";
import { ProductProgressBar } from "@/components/ui/product-progress-bar";
import type { ProductDashboardRow } from "@befine/db";
import { fetchQuery } from "@/lib/action-query";

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
      <h2 className="text-lg font-semibold">{title}</h2>
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
                <th className="w-10 px-2 py-2.5">
                  <span className="sr-only">{t("colDetail")}</span>
                </th>
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
                  <tr key={row.id} className="group relative hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      {/* Stretched link: the whole row opens the product */}
                      <Link
                        href={`${detailBase}/${row.id}`}
                        aria-label={t("openDetailLabel", {
                          order: row.largeOrderClientName ?? "none",
                        })}
                        className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                      >
                        <ProductStatusBadge status={statusKey} />
                      </Link>
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
                              className="relative z-10 text-xs font-medium text-status-attention-foreground hover:underline"
                            >
                              {t("unassignedUnits", { count: row.unassignedQuantity })}
                            </Link>
                          )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {row.approvedPieces}/{row.totalPieces}
                        </span>
                        {/* Same numbers as the label beside it (this product's pieces) */}
                        <ProductProgressBar
                          pct={
                            row.totalPieces > 0
                              ? Math.round((row.approvedPieces / row.totalPieces) * 100)
                              : 0
                          }
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground" aria-hidden="true">
                      <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
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
  const { data: rows = [], isPending: isLoading } = useQuery({
    queryKey: queryKeys.products.dashboard,
    queryFn: () => fetchQuery("productsDashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading && rows.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
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
