"use client";

/**
 * PedidosList — T117 (spec §3.10)
 *
 * Filters (destino, estado, grandes 10+, atrasados, search) live in the URL
 * and apply instantly on the loaded list. Each row is one link to the pedido.
 * Shows each pedido's total and balance, never revenue sums (the secretary
 * sees this screen too).
 */

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangleIcon, CalendarClockIcon, SearchIcon, ShoppingBagIcon } from "lucide-react";
import { formatPedidoNumber } from "@befine/db/pedido-totals";
import type { PedidoListItem } from "@befine/db";
import type { PedidoStatus } from "@befine/db/pedido-status";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { oneOf, useSearchParamState } from "@/hooks/use-search-param-state";
import { formatMoney } from "@/i18n";
import { cn } from "@/lib/utils";

const STATUSES = [
  "pending",
  "in_production",
  "ready",
  "partially_delivered",
  "delivered",
  "paid",
  "cancelled",
] as const satisfies readonly PedidoStatus[];
const DESTINATIONS = ["all", "client", "inventory"] as const;
const FLAGS = ["0", "1"] as const;

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function PedidosList({ pedidos }: { pedidos: PedidoListItem[] }) {
  const t = useTranslations("pedidos");
  const [destination, setDestination] = useSearchParamState("destino", "all", oneOf(DESTINATIONS));
  const [status, setStatus] = useSearchParamState<(typeof STATUSES)[number] | "all">(
    "estado",
    "all",
    oneOf(["all", ...STATUSES] as const),
  );
  const [large, setLarge] = useSearchParamState("grandes", "0", oneOf(FLAGS));
  const [overdue, setOverdue] = useSearchParamState("atrasados", "0", oneOf(FLAGS));
  const [q, setQ] = useSearchParamState<string>("q", "");

  const visible = useMemo(() => {
    const query = normalize(q.trim());
    const numberQuery = /^#?\d+$/.test(query) ? Number(query.replace("#", "")) : null;
    return pedidos.filter((p) => {
      if (destination !== "all" && p.destination !== destination) return false;
      if (status !== "all" && p.status !== status) return false;
      if (large === "1" && !p.isLarge) return false;
      if (overdue === "1" && p.deliveryFlag !== "overdue") return false;
      if (!query) return true;
      if (numberQuery !== null && p.number === numberQuery) return true;
      if (query.startsWith("#")) return false;
      return (
        normalize(p.clientName ?? "").includes(query) ||
        (p.clientPhone ?? "").replace(/\D/g, "").includes(query.replace(/\D/g, "") || "\u0000")
      );
    });
  }, [pedidos, destination, status, large, overdue, q]);

  const overdueCount = pedidos.filter((p) => p.deliveryFlag === "overdue").length;
  const filtered =
    destination !== "all" || status !== "all" || large === "1" || overdue === "1" || q.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <label htmlFor="pedidos-destino" className="text-xs font-medium text-muted-foreground">
              {t("list.destination")}
            </label>
            <NativeSelect
              id="pedidos-destino"
              value={destination}
              onChange={(e) => setDestination(e.target.value as (typeof DESTINATIONS)[number])}
              className="w-full sm:w-40"
            >
              <option value="all">{t("list.all")}</option>
              <option value="client">{t("list.clients")}</option>
              <option value="inventory">{t("inventory")}</option>
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <label htmlFor="pedidos-estado" className="text-xs font-medium text-muted-foreground">
              {t("list.status")}
            </label>
            <NativeSelect
              id="pedidos-estado"
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number] | "all")}
              className="w-full sm:w-44"
            >
              <option value="all">{t("list.all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {(
            [
              ["grandes", large, setLarge, t("list.large")],
              ["atrasados", overdue, setOverdue, t("list.overdue", { count: overdueCount })],
            ] as const
          ).map(([id, value, set, label]) => (
            <label
              key={id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm select-none has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 md:min-h-8",
                value === "1" ? "border-primary bg-primary/10" : "text-muted-foreground",
              )}
            >
              <input
                type="checkbox"
                checked={value === "1"}
                onChange={(e) => set(e.target.checked ? "1" : "0")}
                className="size-4"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("list.count", { count: visible.length })}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={ShoppingBagIcon}
          title={filtered ? t("list.noMatchTitle") : t("emptyTitle")}
          description={filtered ? t("list.noMatchDescription") : t("emptyDescription")}
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((p) => {
            const money =
              p.destination === "inventory" || p.status === "cancelled"
                ? "—"
                : p.saldoAFavor > 0
                  ? t("list.credit", { amount: formatMoney(p.saldoAFavor) })
                  : p.balance > 0
                    ? t("list.balance", { amount: formatMoney(p.balance) })
                    : t("list.settled");
            const moneyClass = cn(
              "font-mono text-sm tabular-nums",
              p.balance > 0 ? "font-semibold" : "text-muted-foreground",
            );
            return (
              <li key={p.id}>
                <Link
                  href={`/pedidos/${p.id}`}
                  className="block min-h-16 space-y-1 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none md:grid md:grid-cols-[5rem_1fr_10rem_8rem_9rem] md:items-center md:gap-4 md:space-y-0"
                >
                  <span className="font-mono text-sm font-semibold tabular-nums max-md:hidden">
                    {formatPedidoNumber(p.number)}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {p.clientName ?? t("inventory")}
                    </span>
                    <StatusBadge status={p.status} label={t(`status.${p.status}`)} />
                    {p.deliveryFlag === "overdue" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
                        {t("flags.overdue")}
                      </span>
                    )}
                    {p.deliveryFlag === "today" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-status-attention-foreground">
                        <CalendarClockIcon className="size-3.5" aria-hidden="true" />
                        {t("flags.today")}
                      </span>
                    )}
                    {p.isLarge && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t("flags.large")}
                      </span>
                    )}
                  </span>
                  <span className="text-right text-sm text-muted-foreground max-md:hidden">
                    {t("list.progress", { approved: p.approved, ordered: p.ordered })}
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums max-md:hidden">
                    {formatMoney(p.total)}
                  </span>
                  <span className={cn(moneyClass, "text-right max-md:hidden")}>{money}</span>
                  {/* Phone: number and progress on one line, balance on the right */}
                  <span className="flex items-baseline justify-between gap-3 md:hidden">
                    <span className="text-sm text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground tabular-nums">
                        {formatPedidoNumber(p.number)}
                      </span>
                      {" · "}
                      {t("list.progress", { approved: p.approved, ordered: p.ordered })}
                    </span>
                    <span className={moneyClass}>{money}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
