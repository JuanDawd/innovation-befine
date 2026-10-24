"use client";

/**
 * Analytics charts (Recharts) — split out of analytics-dashboard.tsx so the
 * library loads on demand via next/dynamic (L-42).
 */

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
import { formatCount, formatMoney } from "@/i18n";

export function ComparisonChart({
  current,
  prior,
  labels,
}: {
  current: { revenue: number; jobs: number; earnings: number };
  prior: { revenue: number; jobs: number; earnings: number };
  labels: { revenue: string; jobs: string; earnings: string };
}) {
  const t = useTranslations("analytics");
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
        <Tooltip formatter={(v: unknown) => formatCount(Number(v))} labelStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="current"
          fill="var(--color-primary)"
          radius={[3, 3, 0, 0]}
          name={t("seriesCurrent")}
        />
        <Bar
          dataKey="prior"
          fill="color-mix(in oklab, var(--color-muted-foreground) 40%, transparent)"
          radius={[3, 3, 0, 0]}
          name={t("seriesPrior")}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Per-employee earnings over the selected days (drill-down row). */
export function EarningsSparkline({ data }: { data: { date: string; earnings: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data}>
        <XAxis dataKey="date" hide />
        <YAxis hide />
        <Tooltip formatter={(v: unknown) => formatMoney(Number(v))} labelStyle={{ fontSize: 10 }} />
        <Line
          type="monotone"
          dataKey="earnings"
          stroke="var(--color-primary)"
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Revenue per business day. */
export function DailyRevenueChart({
  data,
  revenueLabel,
}: {
  data: { date: string; revenue: number }[];
  revenueLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis hide />
        <Tooltip formatter={(v: unknown) => formatMoney(Number(v))} labelStyle={{ fontSize: 10 }} />
        <Bar
          dataKey="revenue"
          fill="var(--color-primary)"
          radius={[2, 2, 0, 0]}
          name={revenueLabel}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
