"use client";

/**
 * T072 + T073 + T074 — Analytics dashboard
 *
 * Day / week / month tabs with:
 * - Large revenue display + colour-coded delta (T072)
 * - Recharts bar chart current vs prior (T073)
 * - Per-employee table with drill-down sparkline (T074)
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  DownloadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAnalyticsSummary,
  getAnalyticsCsvData,
  getEmployeeDrillDown,
  type AnalyticsSummary,
  type EmployeeDrillDownResult,
} from "./actions";
import type { EarningsByEmployee } from "@befine/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(n: number): string {
  return "$" + n.toLocaleString("es-CO");
}

function delta(current: number, prior: number): { pct: number; dir: "up" | "down" | "flat" } {
  if (prior === 0) return { pct: 0, dir: "flat" };
  const pct = ((current - prior) / prior) * 100;
  return { pct: Math.abs(pct), dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

function DeltaIndicator({ current, prior }: { current: number; prior: number }) {
  const { pct, dir } = delta(current, prior);
  if (dir === "flat" && prior === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        dir === "up"
          ? "text-green-600 dark:text-green-400"
          : dir === "down"
            ? "text-red-600 dark:text-red-400"
            : "text-muted-foreground"
      }`}
    >
      {dir === "up" ? (
        <TrendingUpIcon className="size-3" />
      ) : dir === "down" ? (
        <TrendingDownIcon className="size-3" />
      ) : (
        <MinusIcon className="size-3" />
      )}
      {dir === "flat" ? "—" : `${pct.toFixed(1)}%`}
    </span>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  priorValue,
  mono = false,
}: {
  label: string;
  value: number;
  priorValue: number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${mono ? "font-mono tabular-nums" : ""}`}>
        {mono ? formatCOP(value) : value.toLocaleString("es-CO")}
      </p>
      <DeltaIndicator current={value} prior={priorValue} />
    </div>
  );
}

// ─── Bar chart: current vs prior ─────────────────────────────────────────────

function ComparisonChart({
  current,
  prior,
  labels,
}: {
  current: { revenue: number; jobs: number; earnings: number };
  prior: { revenue: number; jobs: number; earnings: number };
  labels: { revenue: string; jobs: string; earnings: string };
}) {
  const data = [
    {
      metric: labels.revenue,
      current: current.revenue,
      prior: prior.revenue,
    },
    {
      metric: labels.jobs,
      current: current.jobs,
      prior: prior.jobs,
    },
    {
      metric: labels.earnings,
      current: current.earnings,
      prior: prior.earnings,
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
        <YAxis hide />
        <Tooltip
          formatter={(v: unknown) => Number(v).toLocaleString("es-CO")}
          labelStyle={{ fontSize: 11 }}
        />
        <Bar dataKey="current" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Actual" />
        <Bar
          dataKey="prior"
          fill="hsl(var(--muted-foreground) / 0.4)"
          radius={[3, 3, 0, 0]}
          name="Período anterior"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Employee drill-down row ──────────────────────────────────────────────────

function EmployeeRow({
  emp,
  period,
}: {
  emp: EarningsByEmployee;
  period: "day" | "week" | "month";
}) {
  const [open, setOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<EmployeeDrillDownResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleDrillDown() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!drillDown) {
      startTransition(async () => {
        const res = await getEmployeeDrillDown(emp.employeeId, period);
        if (res.success) setDrillDown(res.data);
      });
    }
  }

  const sparkData = drillDown?.days.map((d) => ({ date: d.date, earnings: d.earnings })) ?? [];

  return (
    <>
      <tr className="hover:bg-muted/40 cursor-pointer transition-colors" onClick={toggleDrillDown}>
        <td className="px-3 py-2 text-sm font-medium">{emp.employeeName}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground capitalize">{emp.role}</td>
        <td className="px-3 py-2 text-sm text-right tabular-nums">
          {emp.totalEarnings > 0 ? emp.totalEarnings.toLocaleString("es-CO") : "—"}
        </td>
        <td className="px-3 py-2 text-center">
          {open ? (
            <ChevronUpIcon className="size-4 mx-auto text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="size-4 mx-auto text-muted-foreground" />
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="px-3 pb-3 pt-0 bg-muted/10">
            {isPending ? (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" /> Cargando...
              </div>
            ) : drillDown && drillDown.days.length > 0 ? (
              <div className="space-y-2 pt-2">
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={sparkData}>
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v: unknown) => formatCOP(Number(v))}
                      labelStyle={{ fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="earnings"
                      stroke="hsl(var(--primary))"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <table className="w-full text-xs">
                  <tbody>
                    {drillDown.days.map((d) => (
                      <tr key={d.businessDayId} className="border-t">
                        <td className="py-0.5 text-muted-foreground">{d.date}</td>
                        <td className="py-0.5 text-right font-mono">{formatCOP(d.earnings)}</td>
                        <td className="py-0.5 text-right text-muted-foreground">
                          {d.jobs} trabajos
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-3 text-xs text-muted-foreground">Sin datos para este período.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Employee table (T074) ────────────────────────────────────────────────────

type SortKey = "name" | "earnings";

function EmployeeTable({
  rows,
  period,
}: {
  rows: EarningsByEmployee[];
  period: "day" | "week" | "month";
}) {
  const t = useTranslations("analytics");
  const [sortKey, setSortKey] = useState<SortKey>("earnings");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.employeeName.localeCompare(b.employeeName);
    else cmp = a.totalEarnings - b.totalEarnings;
    return sortAsc ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const maxEarnings = Math.max(...rows.map((r) => r.totalEarnings), 1);

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs">
          <tr>
            <th
              className="px-3 py-2 text-left font-medium cursor-pointer select-none"
              onClick={() => toggleSort("name")}
            >
              {t("colEmployee")} {sortKey === "name" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className="px-3 py-2 text-left font-medium">{t("colRole")}</th>
            <th
              className="px-3 py-2 text-right font-medium cursor-pointer select-none"
              onClick={() => toggleSort("earnings")}
            >
              {t("colEarnings")} {sortKey === "earnings" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className="px-3 py-2 w-6" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((emp) => (
            <EmployeeRow key={emp.employeeId} emp={emp} period={period} />
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t("noEmployeeData")}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Inline performance bars */}
      {sorted.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/10 space-y-1">
          {sorted.map((emp) => (
            <div key={emp.employeeId} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-muted-foreground">
                {emp.employeeName.split(" ")[0]}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(emp.totalEarnings / maxEarnings) * 100}%` }}
                />
              </div>
              <span className="font-mono text-muted-foreground w-24 text-right">
                {formatCOP(emp.totalEarnings)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

type Period = "day" | "week" | "month";

export function AnalyticsDashboard({ initialData }: { initialData: AnalyticsSummary }) {
  const t = useTranslations("analytics");
  const [period, setPeriod] = useState<Period>(initialData.period);
  const [data, setData] = useState<AnalyticsSummary>(initialData);
  const [isPending, startTransition] = useTransition();
  const [csvPending, setCsvPending] = useState(false);

  async function downloadCsv() {
    setCsvPending(true);
    try {
      const res = await getAnalyticsCsvData(period);
      if (!res.success) return;
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setCsvPending(false);
    }
  }

  function switchPeriod(p: Period) {
    if (p === period) return;
    setPeriod(p);
    startTransition(async () => {
      const res = await getAnalyticsSummary(p);
      if (res.success) setData(res.data);
    });
  }

  const isEmpty =
    data.current.revenue === 0 && data.current.jobs === 0 && data.current.earnings === 0;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Period tabs + CSV download */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex gap-1 rounded-lg border p-1 w-fit">
          {(["day", "week", "month"] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "ghost"}
              size="sm"
              onClick={() => switchPeriod(p)}
              disabled={isPending}
            >
              {t(`period_${p}`)}
            </Button>
          ))}
          {isPending && (
            <Loader2Icon className="size-4 animate-spin self-center ml-1 text-muted-foreground" />
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={downloadCsv}
          disabled={csvPending || isPending}
        >
          {csvPending ? (
            <Loader2Icon className="size-4 animate-spin mr-1.5" aria-hidden="true" />
          ) : (
            <DownloadIcon className="size-4 mr-1.5" aria-hidden="true" />
          )}
          {t("downloadCsv")}
        </Button>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-xl border border-dashed p-12 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
            <MetricCard
              label={t("revenue")}
              value={data.current.revenue}
              priorValue={data.prior.revenue}
              mono
            />
            <MetricCard label={t("jobs")} value={data.current.jobs} priorValue={data.prior.jobs} />
            <MetricCard
              label={t("earnings")}
              value={data.current.earnings}
              priorValue={data.prior.earnings}
              mono
            />
          </div>

          {/* Comparison bar chart */}
          {period !== "day" && (
            <div className="rounded-xl border p-4 space-y-2">
              <h2 className="text-sm font-semibold">{t("comparisonChart")}</h2>
              <ComparisonChart
                current={data.current}
                prior={data.prior}
                labels={{
                  revenue: t("revenue"),
                  jobs: t("jobs"),
                  earnings: t("earnings"),
                }}
              />
            </div>
          )}

          {/* Daily breakdown (bar chart for week/month) */}
          {data.dailyBreakdown.length > 1 && (
            <div className="rounded-xl border p-4 space-y-2">
              <h2 className="text-sm font-semibold">{t("dailyBreakdown")}</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={data.dailyBreakdown}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: unknown) => formatCOP(Number(v))}
                    labelStyle={{ fontSize: 10 }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="hsl(var(--primary))"
                    radius={[2, 2, 0, 0]}
                    name={t("revenue")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Employee performance table (T074) */}
          <div className="space-y-2 print:hidden">
            <h2 className="text-lg font-semibold">{t("byEmployee")}</h2>
            <EmployeeTable rows={data.earningsTable} period={period} />
          </div>
        </>
      )}
    </div>
  );
}
