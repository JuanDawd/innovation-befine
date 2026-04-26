"use client";

/**
 * T072 + T073 + T074 + T08R-R3 + T08R-R4 + T08R-R13 — Analytics dashboard
 */

import { useState, useTransition, useRef, useCallback } from "react";
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
  BarChart3Icon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useRealtimeEvent } from "@befine/realtime/client";
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

function delta(
  current: number,
  prior: number,
): { pct: number | null; dir: "up" | "down" | "flat" } {
  if (prior === 0) return { pct: null, dir: "flat" };
  const pct = ((current - prior) / prior) * 100;
  return { pct: Math.abs(pct), dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

function DeltaIndicator({ current, prior }: { current: number; prior: number }) {
  const { pct, dir } = delta(current, prior);
  if (pct === null) return null;
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
      {pct === null || dir === "flat" ? "—" : `${pct.toFixed(1)}%`}
    </span>
  );
}

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
    { metric: labels.revenue, current: current.revenue, prior: prior.revenue },
    { metric: labels.jobs, current: current.jobs, prior: prior.jobs },
    { metric: labels.earnings, current: current.earnings, prior: prior.earnings },
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
        const res = await getEmployeeDrillDown({ employeeId: emp.employeeId, period });
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
        <td className="px-3 py-2 text-sm text-right tabular-nums">{emp.jobCount}</td>
        <td className="px-3 py-2 text-sm text-right tabular-nums font-mono">
          {emp.totalEarnings > 0 ? formatCOP(emp.totalEarnings) : "—"}
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
          <td colSpan={5} className="px-3 pb-3 pt-0 bg-muted/10">
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

// ─── Employee table (T074 + T08R-R4 + T08R-R13) ──────────────────────────────

type SortKey = "name" | "jobs" | "earnings";

function EmployeeTable({
  rows,
  period,
  includeInactive,
  onToggleInactive,
}: {
  rows: EarningsByEmployee[];
  period: "day" | "week" | "month";
  includeInactive: boolean;
  onToggleInactive: () => void;
}) {
  const t = useTranslations("analytics");
  const [sortKey, setSortKey] = useState<SortKey>("earnings");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.employeeName.localeCompare(b.employeeName);
    else if (sortKey === "jobs") cmp = a.jobCount - b.jobCount;
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("byEmployee")}</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={onToggleInactive}
            className="size-3.5 rounded"
          />
          {t("includeInactive")}
        </label>
      </div>

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
                onClick={() => toggleSort("jobs")}
              >
                {t("colJobs")} {sortKey === "jobs" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
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
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("noEmployeeData")}
                </td>
              </tr>
            )}
          </tbody>
        </table>

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
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

type Period = "day" | "week" | "month";

export function AnalyticsDashboard({ initialData }: { initialData: AnalyticsSummary }) {
  const t = useTranslations("analytics");
  const [period, setPeriod] = useState<Period>(initialData.period);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [data, setData] = useState<AnalyticsSummary>(initialData);
  const [isPending, startTransition] = useTransition();
  const [csvPending, setCsvPending] = useState(false);

  // Throttled refetch: at most 1 refresh per 5s (T08R-R3)
  const lastRefetchRef = useRef(0);

  const refetch = useCallback((p: Period, inactive: boolean) => {
    const now = Date.now();
    if (now - lastRefetchRef.current < 5000) return;
    lastRefetchRef.current = now;
    startTransition(async () => {
      const res = await getAnalyticsSummary({ period: p, includeInactive: inactive });
      if (res.success) setData(res.data);
    });
  }, []);

  // T08R-R3: refresh on ticket_updated events (throttled to 1/5s)
  useRealtimeEvent("cashier", "ticket_updated", {
    onData: () => refetch(period, includeInactive),
    onPoll: () => refetch(period, includeInactive),
  });

  function switchPeriod(p: Period) {
    if (p === period) return;
    setPeriod(p);
    startTransition(async () => {
      const res = await getAnalyticsSummary({ period: p, includeInactive });
      if (res.success) setData(res.data);
    });
  }

  function toggleInactive() {
    const next = !includeInactive;
    setIncludeInactive(next);
    startTransition(async () => {
      const res = await getAnalyticsSummary({ period, includeInactive: next });
      if (res.success) setData(res.data);
    });
  }

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

  const isEmpty =
    data.current.revenue === 0 && data.current.jobs === 0 && data.current.earnings === 0;

  const totalDays = period === "day" ? 1 : period === "week" ? 7 : new Date().getDate();
  const daysWithData = data.dailyBreakdown.filter((d) => d.revenue > 0).length;
  const isSparse = !isEmpty && totalDays > 1 && daysWithData / totalDays < 0.5;

  return (
    <div className="space-y-8 print:space-y-4">
      {/* Period tabs + CSV download */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold print:text-2xl">{t("pageTitle")}</h1>
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
            disabled={csvPending || isPending || isEmpty}
            title={isEmpty ? t("csvDisabledTooltip") : undefined}
          >
            {csvPending ? (
              <Loader2Icon className="size-4 animate-spin mr-1.5" aria-hidden="true" />
            ) : (
              <DownloadIcon className="size-4 mr-1.5" aria-hidden="true" />
            )}
            {t("downloadCsv")}
          </Button>
        </div>
      </div>
      {/* Sparse-data informational banner */}
      {isSparse && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircleIcon className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{t("sparseData", { daysWithData, totalDays })}</span>
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={BarChart3Icon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      )}

      {!isEmpty && (
        <>
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

          {period !== "day" && (
            <div className="rounded-xl border p-4 space-y-2">
              <h2 className="text-sm font-semibold">{t("comparisonChart")}</h2>
              <ComparisonChart
                current={data.current}
                prior={data.prior}
                labels={{ revenue: t("revenue"), jobs: t("jobs"), earnings: t("earnings") }}
              />
            </div>
          )}

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

          <div className="print:hidden">
            <EmployeeTable
              rows={data.earningsTable}
              period={period}
              includeInactive={includeInactive}
              onToggleInactive={toggleInactive}
            />
          </div>
        </>
      )}
    </div>
  );
}
