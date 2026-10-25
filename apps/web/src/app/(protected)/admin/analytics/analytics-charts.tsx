"use client";

/**
 * Analytics charts (Recharts) — split out of analytics-dashboard.tsx so the
 * library loads on demand via next/dynamic (L-42).
 */

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
import { formatMoney } from "@/i18n";

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
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickFormatter={(v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`}
        />
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
