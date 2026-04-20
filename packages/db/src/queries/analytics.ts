/**
 * T071 — Analytics data queries
 *
 * All queries accept businessDayIds[] so the caller controls the time window.
 * Revenue = sum of effective ticket item prices (override_price ?? unit_price) * quantity
 *   for closed, non-needs_review tickets.
 * earningsByEmployee mirrors the compute-*-earnings logic but runs as a single
 *   SQL aggregation for efficiency.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../index";
import {
  tickets,
  ticketItems,
  batchPieces,
  clothBatches,
  clothPieces,
  employees,
  users,
  businessDays,
  employeeAbsences,
} from "../schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RevenuePeriodResult = {
  totalRevenue: number;
  totalJobs: number;
};

export type JobsCountByEmployee = {
  employeeId: string;
  employeeName: string;
  role: string;
  jobCount: number;
};

export type EarningsByEmployee = {
  employeeId: string;
  employeeName: string;
  role: string;
  totalEarnings: number;
};

export type DailyRevenueRow = {
  businessDayId: string;
  date: string;
  revenue: number;
  jobs: number;
};

// ─── Revenue by period ────────────────────────────────────────────────────────

/**
 * Sum of closed ticket revenue (effective price × quantity) for the given business days.
 * Excludes needs_review tickets.
 */
export async function revenueByPeriod(
  db: Database,
  businessDayIds: string[],
): Promise<RevenuePeriodResult> {
  if (businessDayIds.length === 0) return { totalRevenue: 0, totalJobs: 0 };

  const rows = await db
    .select({
      revenue: sql<number>`
        COALESCE(SUM(
          (COALESCE(${ticketItems.overridePrice}, ${ticketItems.unitPrice})) * ${ticketItems.quantity}
        ), 0)::bigint`,
      jobs: sql<number>`COUNT(DISTINCT ${tickets.id})::int`,
    })
    .from(tickets)
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .where(
      and(
        inArray(tickets.businessDayId, businessDayIds),
        eq(tickets.status, "closed"),
        eq(tickets.needsReview, false),
      ),
    );

  return {
    totalRevenue: Number(rows[0]?.revenue ?? 0),
    totalJobs: Number(rows[0]?.jobs ?? 0),
  };
}

// ─── Jobs count by employee ───────────────────────────────────────────────────

/**
 * Number of closed tickets per employee for the given business days.
 */
export async function jobsCountByEmployee(
  db: Database,
  businessDayIds: string[],
): Promise<JobsCountByEmployee[]> {
  if (businessDayIds.length === 0) return [];

  const rows = await db
    .select({
      employeeId: tickets.employeeId,
      employeeName: users.name,
      role: employees.role,
      jobCount: sql<number>`COUNT(${tickets.id})::int`,
    })
    .from(tickets)
    .innerJoin(employees, eq(tickets.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(
      and(
        inArray(tickets.businessDayId, businessDayIds),
        eq(tickets.status, "closed"),
        eq(tickets.needsReview, false),
      ),
    )
    .groupBy(tickets.employeeId, users.name, employees.role)
    .orderBy(sql`COUNT(${tickets.id}) DESC`);

  return rows.map((r) => ({
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    role: r.role,
    jobCount: Number(r.jobCount),
  }));
}

// ─── Earnings by employee ─────────────────────────────────────────────────────

/**
 * Total earnings per employee for the given business days.
 * Stylist: sum of banker-rounded commission on closed ticket items.
 * Clothier: sum of piece_rate for approved batch_pieces in those days.
 * Secretary: (daysWorked × daily_rate) — computed in application code because
 *   it needs per-ISO-week capping; this function returns 0 for secretary roles
 *   and callers should supplement with computeSecretaryEarnings.
 *
 * Note: banker's rounding applied per-item in application code; SQL aggregation
 * uses standard rounding for the totals displayed in analytics (display only,
 * not used for settlement amounts).
 */
export async function earningsByEmployee(
  db: Database,
  businessDayIds: string[],
): Promise<EarningsByEmployee[]> {
  if (businessDayIds.length === 0) return [];

  // Stylist earnings
  const stylistRows = await db
    .select({
      employeeId: tickets.employeeId,
      employeeName: users.name,
      role: employees.role,
      totalEarnings: sql<number>`
        COALESCE(SUM(
          ROUND(
            (COALESCE(${ticketItems.overridePrice}, ${ticketItems.unitPrice}))::numeric
            * ${ticketItems.commissionPct} / 100
            * ${ticketItems.quantity}
          )
        ), 0)::bigint`,
    })
    .from(tickets)
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(employees, eq(tickets.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(
      and(
        inArray(tickets.businessDayId, businessDayIds),
        eq(tickets.status, "closed"),
        eq(tickets.needsReview, false),
        eq(employees.role, "stylist"),
      ),
    )
    .groupBy(tickets.employeeId, users.name, employees.role);

  // Clothier earnings
  const clothierRows = await db
    .select({
      employeeId: batchPieces.assignedToEmployeeId,
      employeeName: users.name,
      role: employees.role,
      totalEarnings: sql<number>`COALESCE(SUM(${clothPieces.pieceRate}), 0)::bigint`,
    })
    .from(batchPieces)
    .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
    .innerJoin(clothPieces, eq(batchPieces.clothPieceId, clothPieces.id))
    .innerJoin(employees, eq(batchPieces.assignedToEmployeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(
      and(inArray(clothBatches.businessDayId, businessDayIds), eq(batchPieces.status, "approved")),
    )
    .groupBy(batchPieces.assignedToEmployeeId, users.name, employees.role);

  const result = new Map<string, EarningsByEmployee>();

  for (const r of stylistRows) {
    result.set(r.employeeId, {
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      role: r.role,
      totalEarnings: Number(r.totalEarnings),
    });
  }

  for (const r of clothierRows) {
    if (!r.employeeId) continue;
    const existing = result.get(r.employeeId);
    if (existing) {
      existing.totalEarnings += Number(r.totalEarnings);
    } else {
      result.set(r.employeeId, {
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        role: r.role,
        totalEarnings: Number(r.totalEarnings),
      });
    }
  }

  return Array.from(result.values()).sort((a, b) => b.totalEarnings - a.totalEarnings);
}

// ─── Daily revenue breakdown ──────────────────────────────────────────────────

/**
 * Revenue and job count per business day — used for bar charts.
 */
export async function dailyRevenueBreakdown(
  db: Database,
  businessDayIds: string[],
): Promise<DailyRevenueRow[]> {
  if (businessDayIds.length === 0) return [];

  const rows = await db
    .select({
      businessDayId: tickets.businessDayId,
      openedAt: businessDays.openedAt,
      revenue: sql<number>`
        COALESCE(SUM(
          (COALESCE(${ticketItems.overridePrice}, ${ticketItems.unitPrice})) * ${ticketItems.quantity}
        ), 0)::bigint`,
      jobs: sql<number>`COUNT(DISTINCT ${tickets.id})::int`,
    })
    .from(tickets)
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(businessDays, eq(tickets.businessDayId, businessDays.id))
    .where(
      and(
        inArray(tickets.businessDayId, businessDayIds),
        eq(tickets.status, "closed"),
        eq(tickets.needsReview, false),
      ),
    )
    .groupBy(tickets.businessDayId, businessDays.openedAt)
    .orderBy(businessDays.openedAt);

  return rows.map((r) => ({
    businessDayId: r.businessDayId,
    date: new Date(r.openedAt).toISOString().slice(0, 10),
    revenue: Number(r.revenue),
    jobs: Number(r.jobs),
  }));
}

// ─── Business days by period helper ──────────────────────────────────────────

export type PeriodDays = {
  current: string[];
  prior: string[];
};

/**
 * Returns closed business day IDs for the current and prior period.
 * period = "day" | "week" | "month" — boundaries anchored to America/Bogota.
 */
export async function getBusinessDayIdsByPeriod(
  db: Database,
  period: "day" | "week" | "month",
  bogotaToday: string,
): Promise<PeriodDays> {
  const today = new Date(bogotaToday + "T12:00:00-05:00");

  let currentStart: Date;
  let currentEnd: Date;
  let priorStart: Date;
  let priorEnd: Date;

  if (period === "day") {
    currentStart = new Date(bogotaToday + "T00:00:00-05:00");
    currentEnd = new Date(bogotaToday + "T23:59:59-05:00");
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    priorStart = new Date(yStr + "T00:00:00-05:00");
    priorEnd = new Date(yStr + "T23:59:59-05:00");
  } else if (period === "week") {
    const dow = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(monday.getDate() - (dow - 1));
    const mondayStr = monday.toISOString().slice(0, 10);
    currentStart = new Date(mondayStr + "T00:00:00-05:00");
    currentEnd = new Date(bogotaToday + "T23:59:59-05:00");
    const priorMonday = new Date(monday);
    priorMonday.setDate(priorMonday.getDate() - 7);
    const priorSunday = new Date(monday);
    priorSunday.setDate(priorSunday.getDate() - 1);
    priorStart = new Date(priorMonday.toISOString().slice(0, 10) + "T00:00:00-05:00");
    priorEnd = new Date(priorSunday.toISOString().slice(0, 10) + "T23:59:59-05:00");
  } else {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fomStr = firstOfMonth.toISOString().slice(0, 10);
    currentStart = new Date(fomStr + "T00:00:00-05:00");
    currentEnd = new Date(bogotaToday + "T23:59:59-05:00");
    const priorFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const priorLast = new Date(today.getFullYear(), today.getMonth(), 0);
    priorStart = new Date(priorFirst.toISOString().slice(0, 10) + "T00:00:00-05:00");
    priorEnd = new Date(priorLast.toISOString().slice(0, 10) + "T23:59:59-05:00");
  }

  const allClosed = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(sql`${businessDays.closedAt} IS NOT NULL`);

  function filterIds(start: Date, end: Date) {
    return allClosed
      .filter((d) => {
        const t = new Date(d.openedAt).getTime();
        return t >= start.getTime() && t <= end.getTime();
      })
      .map((d) => d.id);
  }

  return {
    current: filterIds(currentStart, currentEnd),
    prior: filterIds(priorStart, priorEnd),
  };
}

// ─── Per-employee day-by-day breakdown ───────────────────────────────────────

export type EmployeeDayBreakdown = {
  businessDayId: string;
  date: string;
  jobs: number;
  earnings: number;
};

/**
 * Day-by-day jobs + earnings for a single employee in the given business days.
 * Stylist: commission sum per day. Clothier: piece_rate sum per day.
 */
export async function employeeDayBreakdown(
  db: Database,
  employeeId: string,
  businessDayIds: string[],
): Promise<EmployeeDayBreakdown[]> {
  if (businessDayIds.length === 0) return [];

  const [emp] = await db
    .select({ role: employees.role })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp) return [];

  if (emp.role === "stylist") {
    const rows = await db
      .select({
        businessDayId: tickets.businessDayId,
        openedAt: businessDays.openedAt,
        jobs: sql<number>`COUNT(DISTINCT ${tickets.id})::int`,
        earnings: sql<number>`
          COALESCE(SUM(
            ROUND(
              (COALESCE(${ticketItems.overridePrice}, ${ticketItems.unitPrice}))::numeric
              * ${ticketItems.commissionPct} / 100
              * ${ticketItems.quantity}
            )
          ), 0)::bigint`,
      })
      .from(tickets)
      .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
      .innerJoin(businessDays, eq(tickets.businessDayId, businessDays.id))
      .where(
        and(
          eq(tickets.employeeId, employeeId),
          inArray(tickets.businessDayId, businessDayIds),
          eq(tickets.status, "closed"),
          eq(tickets.needsReview, false),
        ),
      )
      .groupBy(tickets.businessDayId, businessDays.openedAt)
      .orderBy(businessDays.openedAt);

    return rows.map((r) => ({
      businessDayId: r.businessDayId,
      date: new Date(r.openedAt).toISOString().slice(0, 10),
      jobs: Number(r.jobs),
      earnings: Number(r.earnings),
    }));
  }

  if (emp.role === "clothier") {
    const rows = await db
      .select({
        businessDayId: clothBatches.businessDayId,
        openedAt: businessDays.openedAt,
        jobs: sql<number>`COUNT(${batchPieces.id})::int`,
        earnings: sql<number>`COALESCE(SUM(${clothPieces.pieceRate}), 0)::bigint`,
      })
      .from(batchPieces)
      .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
      .innerJoin(clothPieces, eq(batchPieces.clothPieceId, clothPieces.id))
      .innerJoin(businessDays, eq(clothBatches.businessDayId, businessDays.id))
      .where(
        and(
          eq(batchPieces.assignedToEmployeeId, employeeId),
          inArray(clothBatches.businessDayId, businessDayIds),
          eq(batchPieces.status, "approved"),
        ),
      )
      .groupBy(clothBatches.businessDayId, businessDays.openedAt)
      .orderBy(businessDays.openedAt);

    return rows.map((r) => ({
      businessDayId: r.businessDayId,
      date: new Date(r.openedAt).toISOString().slice(0, 10),
      jobs: Number(r.jobs),
      earnings: Number(r.earnings),
    }));
  }

  // Secretary — day-by-day breakdown (presence only; capping is per-week)
  const dayRows = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(and(inArray(businessDays.id, businessDayIds), sql`${businessDays.closedAt} IS NOT NULL`))
    .orderBy(businessDays.openedAt);

  const dateStrings = dayRows.map((d) => new Date(d.openedAt).toISOString().slice(0, 10));
  const absenceRows = await db
    .select({ date: employeeAbsences.date })
    .from(employeeAbsences)
    .where(
      and(
        eq(employeeAbsences.employeeId, employeeId),
        inArray(employeeAbsences.date, dateStrings),
        sql`${employeeAbsences.type} IN ('vacation', 'approved_absence')`,
      ),
    );
  const excludedDates = new Set(absenceRows.map((a) => a.date));

  const [empData] = await db
    .select({ dailyRate: employees.dailyRate })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  const dailyRate = empData?.dailyRate ?? 0;

  return dayRows.map((d) => {
    const dateStr = new Date(d.openedAt).toISOString().slice(0, 10);
    const present = !excludedDates.has(dateStr);
    return {
      businessDayId: d.id,
      date: dateStr,
      jobs: present ? 1 : 0,
      earnings: present ? dailyRate : 0,
    };
  });
}
