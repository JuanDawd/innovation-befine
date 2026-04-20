"use server";

/**
 * Analytics server actions — T072, T073, T074
 *
 * getAnalyticsSummary: admin — revenue, jobs, earnings for current + prior period
 * getEmployeePerformance: admin — per-employee jobs + earnings table for a period
 * getEmployeeDrillDown: admin — day-by-day breakdown for one employee
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasRole } from "@/lib/middleware-helpers";
import { todayInBogota } from "@/lib/dates";
import {
  revenueByPeriod,
  earningsByEmployee,
  dailyRevenueBreakdown,
  getBusinessDayIdsByPeriod,
  employeeDayBreakdown,
  type DailyRevenueRow,
  type EarningsByEmployee,
  type EmployeeDayBreakdown,
} from "@befine/db";
import type { ActionResult } from "@/lib/action-result";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, code: "UNAUTHORIZED" as const };
  if (!hasRole(session.user, "cashier_admin"))
    return { ok: false as const, code: "FORBIDDEN" as const };
  return { ok: true as const, code: null };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PeriodMetrics = {
  revenue: number;
  jobs: number;
  earnings: number;
};

export type AnalyticsSummary = {
  period: "day" | "week" | "month";
  current: PeriodMetrics;
  prior: PeriodMetrics;
  dailyBreakdown: DailyRevenueRow[];
  earningsTable: EarningsByEmployee[];
};

export type EmployeeDrillDownResult = {
  employeeId: string;
  employeeName: string;
  role: string;
  days: EmployeeDayBreakdown[];
};

// ─── Analytics summary ────────────────────────────────────────────────────────

export async function getAnalyticsSummary(
  period: "day" | "week" | "month",
): Promise<ActionResult<AnalyticsSummary>> {
  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const today = todayInBogota();
  const { current, prior } = await getBusinessDayIdsByPeriod(db, period, today);

  const [
    currentRevenue,
    priorRevenue,
    currentEarnings,
    priorEarnings,
    dailyBreakdown,
    earningsTable,
  ] = await Promise.all([
    revenueByPeriod(db, current),
    revenueByPeriod(db, prior),
    earningsByEmployee(db, current),
    earningsByEmployee(db, prior),
    dailyRevenueBreakdown(db, current),
    earningsByEmployee(db, current),
  ]);

  const sumEarnings = (rows: EarningsByEmployee[]) => rows.reduce((s, r) => s + r.totalEarnings, 0);

  return {
    success: true,
    data: {
      period,
      current: {
        revenue: currentRevenue.totalRevenue,
        jobs: currentRevenue.totalJobs,
        earnings: sumEarnings(currentEarnings),
      },
      prior: {
        revenue: priorRevenue.totalRevenue,
        jobs: priorRevenue.totalJobs,
        earnings: sumEarnings(priorEarnings),
      },
      dailyBreakdown,
      earningsTable,
    },
  };
}

// ─── Employee performance table ───────────────────────────────────────────────

export async function getEmployeePerformance(
  period: "day" | "week" | "month",
): Promise<ActionResult<EarningsByEmployee[]>> {
  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const today = todayInBogota();
  const { current } = await getBusinessDayIdsByPeriod(db, period, today);
  const rows = await earningsByEmployee(db, current);
  return { success: true, data: rows };
}

// ─── CSV export (T076) ───────────────────────────────────────────────────────

export async function getAnalyticsCsvData(
  period: "day" | "week" | "month",
): Promise<ActionResult<{ csv: string; filename: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const today = todayInBogota();
  const { current } = await getBusinessDayIdsByPeriod(db, period, today);

  const [revenue, earnings, daily] = await Promise.all([
    revenueByPeriod(db, current),
    earningsByEmployee(db, current),
    dailyRevenueBreakdown(db, current),
  ]);

  const rows: string[] = [
    "Fecha,Ingresos,Trabajos",
    ...daily.map((d) => `${d.date},${d.revenue},${d.jobs}`),
    "",
    "Empleado,Rol,Ganancias",
    ...earnings.map((e) => `${e.employeeName},${e.role},${e.totalEarnings}`),
    "",
    `Total ingresos,${revenue.totalRevenue}`,
    `Total trabajos,${revenue.totalJobs}`,
    `Total ganancias,${earnings.reduce((s, e) => s + e.totalEarnings, 0)}`,
  ];

  const periodLabel = today.slice(0, 7);
  const filename = `innovation-befine-${periodLabel}-${period}.csv`;

  return { success: true, data: { csv: rows.join("\n"), filename } };
}

// ─── Employee drill-down ──────────────────────────────────────────────────────

export async function getEmployeeDrillDown(
  employeeId: string,
  period: "day" | "week" | "month",
): Promise<ActionResult<EmployeeDrillDownResult>> {
  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const today = todayInBogota();
  const { current } = await getBusinessDayIdsByPeriod(db, period, today);
  const days = await employeeDayBreakdown(db, employeeId, current);

  // Fetch employee name
  const { employees, users } = await import("@befine/db/schema");
  const { eq } = await import("drizzle-orm");
  const [emp] = await db
    .select({ name: users.name, role: employees.role })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  return {
    success: true,
    data: { employeeId, employeeName: emp.name, role: emp.role, days },
  };
}
