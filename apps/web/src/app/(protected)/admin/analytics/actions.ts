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
  revenueByMethod,
  type RevenueByMethod,
  periodWindows,
  getIncomeRows,
  summarizeDayIncome,
  pedidoFiguresNow,
  pedidoFiguresForPeriod,
  productionFigures,
  inventoryFiguresNow,
  inventoryFiguresForPeriod,
  type DayIncome,
  type PedidoNowFigures,
  type PedidoPeriodFigures,
  type ProductionFigures,
  type InventoryNowFigures,
  type InventoryPeriodFigures,
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
  if (!hasRole(session.user, "admin"))
    return { ok: false as const, code: "FORBIDDEN" as const, userId: null };
  return { ok: true as const, code: null, userId: session.user.id };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PeriodMetrics = {
  revenue: number;
  serviceRevenue: number;
  productSalesRevenue: number;
  jobs: number;
  earnings: number;
  earningsBySource: {
    service: number;
    pieceCreated: number;
    workedDay: number;
  };
};

export type AnalyticsSummary = {
  period: "day" | "week" | "month";
  current: PeriodMetrics;
  prior: PeriodMetrics;
  dailyBreakdown: DailyRevenueRow[];
  earningsTable: EarningsByEmployee[];
  /** Money taken per payment method in the current period — to reconcile the till */
  byMethod: RevenueByMethod;
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

  const [currentRevenue, priorRevenue, currentEarnings, priorEarnings, dailyBreakdown, byMethod] =
    await Promise.all([
      revenueByPeriod(db, current),
      revenueByPeriod(db, prior),
      earningsByEmployee(db, current, { activeOnly: !includeInactive }),
      earningsByEmployee(db, prior, { activeOnly: !includeInactive }),
      dailyRevenueBreakdown(db, current),
      revenueByMethod(db, current),
    ]);

  const sumEarnings = (rows: EarningsByEmployee[]) => rows.reduce((s, r) => s + r.totalEarnings, 0);
  const sumSource = (
    rows: EarningsByEmployee[],
    key: keyof EarningsByEmployee["earningsBySource"],
  ) => rows.reduce((s, r) => s + r.earningsBySource[key], 0);

  return {
    success: true,
    data: {
      period,
      current: {
        revenue: currentRevenue.totalRevenue,
        serviceRevenue: currentRevenue.serviceRevenue,
        productSalesRevenue: currentRevenue.productSalesRevenue,
        jobs: currentRevenue.totalJobs,
        earnings: sumEarnings(currentEarnings),
        earningsBySource: {
          service: sumSource(currentEarnings, "service"),
          pieceCreated: sumSource(currentEarnings, "pieceCreated"),
          workedDay: sumSource(currentEarnings, "workedDay"),
        },
      },
      prior: {
        revenue: priorRevenue.totalRevenue,
        serviceRevenue: priorRevenue.serviceRevenue,
        productSalesRevenue: priorRevenue.productSalesRevenue,
        jobs: priorRevenue.totalJobs,
        earnings: sumEarnings(priorEarnings),
        earningsBySource: {
          service: sumSource(priorEarnings, "service"),
          pieceCreated: sumSource(priorEarnings, "pieceCreated"),
          workedDay: sumSource(priorEarnings, "workedDay"),
        },
      },
      dailyBreakdown,
      earningsTable: currentEarnings,
      byMethod,
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

// ─── Pedidos, producción, inventario — T133 (spec §3.11) ─────────────────────

export type PedidoAnalytics = {
  period: "day" | "week" | "month";
  income: { current: DayIncome; prior: DayIncome };
  pedidos: { now: PedidoNowFigures; current: PedidoPeriodFigures; prior: PedidoPeriodFigures };
  production: { current: ProductionFigures; prior: ProductionFigures };
  inventory: {
    now: InventoryNowFigures;
    current: InventoryPeriodFigures;
    prior: InventoryPeriodFigures;
  };
};

async function loadPedidoAnalytics(period: "day" | "week" | "month"): Promise<PedidoAnalytics> {
  const db = getDb();
  const today = todayInBogota();
  const { current, prior } = await getBusinessDayIdsByPeriod(db, period, today);
  const w = periodWindows(period, today);
  const cw = { start: w.currentStart, end: w.currentEnd };
  const pw = { start: w.priorStart, end: w.priorEnd };
  const [incC, incP, now, pedC, pedP, prodC, prodP, invNow, invC, invP] = await Promise.all([
    getIncomeRows(db, current),
    getIncomeRows(db, prior),
    pedidoFiguresNow(db, today),
    pedidoFiguresForPeriod(db, cw),
    pedidoFiguresForPeriod(db, pw),
    productionFigures(db, current),
    productionFigures(db, prior),
    inventoryFiguresNow(db),
    inventoryFiguresForPeriod(db, cw, current),
    inventoryFiguresForPeriod(db, pw, prior),
  ]);
  return {
    period,
    income: { current: summarizeDayIncome(incC), prior: summarizeDayIncome(incP) },
    pedidos: { now, current: pedC, prior: pedP },
    production: { current: prodC, prior: prodP },
    inventory: { now: invNow, current: invC, prior: invP },
  };
}

/** Admin only: the secretary never sees these figures (spec §3.8). */
export async function getPedidoAnalytics(
  rawPeriod: unknown,
): Promise<ActionResult<PedidoAnalytics>> {
  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };
  const parsed = analyticsPeriodSchema.safeParse(rawPeriod);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Período inválido" } };
  return { success: true, data: await loadPedidoAnalytics(parsed.data) };
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of every T133 section for the period (section,item,metric,value). */
export async function getPedidoAnalyticsCsv(
  rawPeriod: unknown,
): Promise<ActionResult<{ csv: string; filename: string }>> {
  const res = await getPedidoAnalytics(rawPeriod);
  if (!res.success) return res;
  const a = res.data;
  const rows: (string | number | null)[][] = [["seccion", "elemento", "metrica", "valor"]];
  for (const src of ["services", "pedidos", "prendas"] as const)
    rows.push(["ingresos", src, "total", a.income.current.bySource[src].total]);
  for (const m of ["cash", "card", "transfer", "unknown"] as const)
    rows.push(["ingresos", "medio", m, a.income.current.byMethod[m]]);
  rows.push(["ingresos", "fuera_de_horario", "total", a.income.current.afterHours.total]);
  const p = a.pedidos;
  rows.push(
    ["pedidos", "periodo", "creados", p.current.created],
    ["pedidos", "periodo", "unidades", p.current.units],
    ["pedidos", "periodo", "entregados", p.current.completed],
    ["pedidos", "periodo", "a_tiempo", p.current.onTime],
    ["pedidos", "periodo", "con_fecha", p.current.withPromise],
    ["pedidos", "periodo", "dias_promedio_entrega", p.current.avgLeadDays],
    ["pedidos", "ahora", "cuentas_por_cobrar", p.now.receivablesTotal],
    ["pedidos", "ahora", "saldo_a_favor", p.now.saldoAFavorTotal],
    ["pedidos", "ahora", "atrasados", p.now.overdue.length],
  );
  for (const r of p.now.receivables)
    rows.push([
      "cuentas_por_cobrar",
      `#${String(r.number).padStart(4, "0")} ${r.clientName ?? ""}`.trim(),
      "saldo",
      r.balance,
    ]);
  for (const c of a.production.current.byClothier)
    rows.push(
      ["produccion", c.name, "aprobadas", c.approved],
      ["produccion", c.name, "devueltas", c.returned],
      ["produccion", c.name, "tasa_devolucion_pct", c.returnRate],
    );
  for (const g of a.production.current.byGarment)
    rows.push(
      ["produccion_prenda", g.garment, "aprobadas", g.approved],
      ["produccion_prenda", g.garment, "costo_mano_obra", g.labourCost],
      ["produccion_prenda", g.garment, "precio", g.price],
      ["produccion_prenda", g.garment, "margen", g.margin],
    );
  rows.push(
    [
      "produccion",
      "todas",
      "horas_asignacion_a_aprobacion",
      a.production.current.avgAssignToApprovalHours,
    ],
    ["inventario", "ahora", "unidades", a.inventory.now.unitsOnHand],
    ["inventario", "ahora", "valor_a_precio_venta", a.inventory.now.valueAtPrice],
    ["inventario", "periodo", "vendidas", a.inventory.current.unitsSold],
    ["inventario", "periodo", "bajas", a.inventory.current.writeOffUnits],
  );
  for (const sm of a.inventory.now.slowMovers)
    rows.push([
      "inventario_lento",
      [sm.garment, sm.sizeLabel, sm.colorLabel].filter(Boolean).join(" · "),
      "unidades",
      sm.onHand,
    ]);
  return {
    success: true,
    data: {
      csv: rows.map((r) => r.map(csvCell).join(",")).join("\n"),
      filename: `befine-pedidos-${a.period}-${todayInBogota()}.csv`,
    },
  };
}
