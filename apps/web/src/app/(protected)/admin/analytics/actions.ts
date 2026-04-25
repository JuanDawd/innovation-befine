"use server";

/**
 * Analytics server actions — T072, T073, T074, T08R-R4, T08R-R5, T08R-R10
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasRole } from "@/lib/middleware-helpers";
import { todayInBogota } from "@/lib/dates";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
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
import {
  analyticsQuerySchema,
  employeeDrillDownSchema,
  analyticsPeriodSchema,
} from "@befine/types";
import type { ActionResult } from "@/lib/action-result";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, code: "UNAUTHORIZED" as const, userId: null };
  if (!hasRole(session.user, "cashier_admin"))
    return { ok: false as const, code: "FORBIDDEN" as const, userId: null };
  return { ok: true as const, code: null, userId: session.user.id };
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
  rawInput: unknown,
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

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return { success: false, error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes." } };

  const parsed = analyticsQuerySchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Período inválido",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const { period, includeInactive } = parsed.data;
  const db = getDb();
  const today = todayInBogota();
  const { current, prior } = await getBusinessDayIdsByPeriod(db, period, today);

  const [currentRevenue, priorRevenue, currentEarnings, priorEarnings, dailyBreakdown] =
    await Promise.all([
      revenueByPeriod(db, current),
      revenueByPeriod(db, prior),
      earningsByEmployee(db, current, { activeOnly: !includeInactive }),
      earningsByEmployee(db, prior, { activeOnly: !includeInactive }),
      dailyRevenueBreakdown(db, current),
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
      earningsTable: currentEarnings,
    },
  };
}

// ─── Employee performance table ───────────────────────────────────────────────

export async function getEmployeePerformance(
  rawInput: unknown,
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

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return { success: false, error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes." } };

  const parsed = analyticsQuerySchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Período inválido",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const { period, includeInactive } = parsed.data;
  const db = getDb();
  const today = todayInBogota();
  const { current } = await getBusinessDayIdsByPeriod(db, period, today);
  const rows = await earningsByEmployee(db, current, { activeOnly: !includeInactive });
  return { success: true, data: rows };
}

// ─── CSV export (T076 + T08R-R12) ────────────────────────────────────────────

export async function getAnalyticsCsvData(
  rawPeriod: unknown,
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

  const rl = await checkRateLimit(rateLimits.analyticsCsv, guard.userId!);
  if (!rl.allowed)
    return { success: false, error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes." } };

  const parsed = analyticsPeriodSchema.safeParse(rawPeriod);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Período inválido",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const period = parsed.data;
  const db = getDb();
  const today = todayInBogota();
  const { current } = await getBusinessDayIdsByPeriod(db, period, today);

  const [daily, earnings] = await Promise.all([
    dailyRevenueBreakdown(db, current),
    earningsByEmployee(db, current, { activeOnly: true }),
  ]);

  // T08R-R12: one row per business-day × employee
  const header = "Fecha,Empleado,Rol,Trabajos,Ganancias,IngresosDia,TrabajosDia";
  const dataRows: string[] = [];

  for (const day of daily) {
    for (const emp of earnings) {
      dataRows.push(
        [
          day.date,
          emp.employeeName,
          emp.role,
          emp.jobCount,
          emp.totalEarnings,
          day.revenue,
          day.jobs,
        ].join(","),
      );
    }
    // Days with no employee rows still get a revenue summary line
    if (earnings.length === 0) {
      dataRows.push([day.date, "", "", 0, 0, day.revenue, day.jobs].join(","));
    }
  }

  // Totals footer
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);
  const totalEarnings = earnings.reduce((s, e) => s + e.totalEarnings, 0);
  dataRows.push("");
  dataRows.push(`Total,,,, ${totalEarnings},${totalRevenue},`);

  const csv = [header, ...dataRows].join("\n");
  const periodLabel = today.slice(0, 7);
  const filename = `innovation-befine-${periodLabel}-${period}.csv`;

  return { success: true, data: { csv, filename } };
}

// ─── Employee drill-down ──────────────────────────────────────────────────────

export async function getEmployeeDrillDown(
  rawInput: unknown,
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

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return { success: false, error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes." } };

  const parsed = employeeDrillDownSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const { employeeId, period } = parsed.data;
  const db = getDb();
  const today = todayInBogota();
  const { current } = await getBusinessDayIdsByPeriod(db, period, today);
  const days = await employeeDayBreakdown(db, employeeId, current);

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

  return { success: true, data: { employeeId, employeeName: emp.name, role: emp.role, days } };
}
