"use client";

/**
 * Analítica: pedidos, producción e inventario — T133 (spec §3.11)
 *
 * Same period as the dashboard above it, with the previous period for
 * comparison. Admin only (the action refuses anyone else).
 */

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertTriangleIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IncomeBreakdown } from "@/components/income-breakdown";
import { formatDate, formatMoney } from "@/i18n";
import { DeltaIndicator, MetricCard } from "./analytics-dashboard";
import { getPedidoAnalytics, getPedidoAnalyticsCsv, type PedidoAnalytics as Data } from "./actions";

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
const number = (n: number) => `#${String(n).padStart(4, "0")}`;

function Stat({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { current: number; prior: number };
}) {
  return (
    <div className="space-y-1 rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-bold tabular-nums">{value}</p>
      {delta && <DeltaIndicator current={delta.current} prior={delta.prior} />}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Table({
  caption,
  head,
  rows,
  empty,
}: {
  caption: string;
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="rounded-xl border p-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-2 text-left font-medium">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-2 text-right font-mono tabular-nums">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Body({ a }: { a: Data }) {
  const t = useTranslations("analytics.pedidos");
  const inc = a.income;
  const p = a.pedidos;
  const onTimeNow = pct(p.current.onTime, p.current.withPromise);
  const onTimePrior = pct(p.prior.onTime, p.prior.withPromise);
  return (
    <div className="space-y-8">
      <Section id="an-income" title={t("incomeTitle")} hint={t("incomeHint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["services", "pedidos", "prendas"] as const).map((src) => (
            <MetricCard
              key={src}
              label={t(`sources.${src}`)}
              value={inc.current.bySource[src].total}
              priorValue={inc.prior.bySource[src].total}
              mono
            />
          ))}
        </div>
        <IncomeBreakdown income={inc.current} />
      </Section>

      <Section id="an-pedidos" title={t("pedidosTitle")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label={t("created")} value={p.current.created} priorValue={p.prior.created} />
          <MetricCard label={t("units")} value={p.current.units} priorValue={p.prior.units} />
          <Stat
            label={t("onTime")}
            value={onTimeNow === null ? "—" : `${onTimeNow}%`}
            sub={t("onTimeSub", { onTime: p.current.onTime, total: p.current.withPromise })}
            delta={
              onTimeNow !== null && onTimePrior !== null
                ? { current: onTimeNow, prior: onTimePrior }
                : undefined
            }
          />
          <Stat
            label={t("leadTime")}
            value={p.current.avgLeadDays === null ? "—" : t("days", { n: p.current.avgLeadDays })}
            sub={t("leadTimeSub", { n: p.current.completed })}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <h3 className="text-sm font-semibold">
              {t("receivables")} ·{" "}
              <span className="font-mono tabular-nums">{formatMoney(p.now.receivablesTotal)}</span>
            </h3>
            <Table
              caption={t("receivables")}
              head={[t("pedido"), t("age"), t("balance")]}
              empty={t("receivablesEmpty")}
              rows={p.now.receivables.slice(0, 15).map((r) => [
                <Link
                  key="l"
                  href={`/pedidos/${r.id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {number(r.number)} {r.clientName}
                </Link>,
                t("days", { n: r.ageDays }),
                formatMoney(r.balance),
              ])}
            />
            {p.now.receivables.length > 15 && (
              <p className="text-xs text-muted-foreground">
                {t("moreInCsv", { n: p.now.receivables.length - 15 })}
              </p>
            )}
          </div>
          <div className="space-y-3">
            <Stat
              label={t("saldoAFavor")}
              value={formatMoney(p.now.saldoAFavorTotal)}
              sub={t("saldoAFavorSub", { n: p.now.saldoAFavorCount })}
            />
            <div className="space-y-2 rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{t("overdue")}</p>
              <p className="font-mono text-2xl font-bold tabular-nums">{p.now.overdue.length}</p>
              <ul className="space-y-1 text-sm">
                {p.now.overdue.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/pedidos/${o.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {number(o.number)}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {o.clientName} ·{" "}
                      {t("promised", {
                        date: formatDate(`${o.estimatedDeliveryDate}T12:00:00-05:00`),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="an-production"
        title={t("productionTitle")}
        hint={
          a.production.current.avgAssignToApprovalHours === null
            ? undefined
            : t("assignToApproval", { h: a.production.current.avgAssignToApprovalHours })
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Table
            caption={t("byClothier")}
            head={[t("clothier"), t("approved"), t("returned"), t("returnRate")]}
            empty={t("productionEmpty")}
            rows={a.production.current.byClothier.map((c) => [
              c.name,
              c.approved,
              c.returned,
              `${c.returnRate}%`,
            ])}
          />
          <Table
            caption={t("byGarment")}
            head={[
              t("garment"),
              t("approved"),
              t("returnRate"),
              t("labour"),
              t("price"),
              t("margin"),
            ]}
            empty={t("productionEmpty")}
            rows={a.production.current.byGarment.map((g) => [
              g.garment,
              g.approved,
              `${g.returnRate}%`,
              formatMoney(g.labourCost),
              formatMoney(g.price),
              formatMoney(g.margin),
            ])}
          />
        </div>
      </Section>

      <Section id="an-inventory" title={t("inventoryTitle")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("onHand")} value={String(a.inventory.now.unitsOnHand)} />
          <Stat
            label={t("stockValue")}
            value={formatMoney(a.inventory.now.valueAtPrice)}
            sub={t("stockValueSub")}
          />
          <MetricCard
            label={t("sold")}
            value={a.inventory.current.unitsSold}
            priorValue={a.inventory.prior.unitsSold}
          />
          <MetricCard
            label={t("writeOffs")}
            value={a.inventory.current.writeOffUnits}
            priorValue={a.inventory.prior.writeOffUnits}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Table
            caption={t("slowMovers")}
            head={[t("slowMovers"), t("onHand"), t("lastMovement")]}
            empty={t("slowMoversEmpty")}
            rows={a.inventory.now.slowMovers.map((sm) => [
              [sm.garment, sm.sizeLabel, sm.colorLabel].filter(Boolean).join(" · "),
              sm.onHand,
              formatDate(sm.lastMovementAt),
            ])}
          />
          <Table
            caption={t("writeOffs")}
            head={[t("writeOffs"), t("units"), t("when")]}
            empty={t("writeOffsEmpty")}
            rows={a.inventory.current.writeOffs.map((w) => [
              <span key="g">
                {w.garment}
                {w.reason && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {w.reason}
                  </span>
                )}
              </span>,
              w.quantity,
              formatDate(w.createdAt),
            ])}
          />
        </div>
      </Section>
    </div>
  );
}

export function PedidoAnalytics({ period }: { period: "day" | "week" | "month" }) {
  const t = useTranslations("analytics.pedidos");
  const [csvPending, setCsvPending] = useState(false);
  const q = useQuery({
    queryKey: ["analytics", "pedidos", period],
    queryFn: async () => {
      const res = await getPedidoAnalytics(period);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  async function downloadCsv() {
    setCsvPending(true);
    try {
      const res = await getPedidoAnalyticsCsv(period);
      if (!res.success) return;
      const url = URL.createObjectURL(
        new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvPending(false);
    }
  }

  return (
    <div className="space-y-4 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <Button variant="outline" size="sm" onClick={downloadCsv} disabled={csvPending || !q.data}>
          {csvPending ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <DownloadIcon className="size-4" aria-hidden="true" />
          )}
          {t("csv")}
        </Button>
      </div>
      {q.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          {t("loading")}
        </p>
      ) : q.isError ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-status-negative-foreground">
          <AlertTriangleIcon className="size-4" aria-hidden="true" />
          {q.error.message}
        </p>
      ) : (
        <Body a={q.data} />
      )}
    </div>
  );
}
