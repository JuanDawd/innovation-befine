/**
 * T071 — Analytics data queries
 *
 * All queries accept businessDayIds[] so the caller controls the time window.
 * Revenue = sum of effective ticket item prices (override_price ?? unit_price) * quantity
 *   for closed, non-needs_review tickets.
 * earningsByEmployee mirrors the compute-*-earnings logic but runs as a single
 *   SQL aggregation for efficiency.
 */

import { and, eq, inArray, or, sql } from "drizzle-orm";
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
  jobCount: number;
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
  { activeOnly = true }: { activeOnly?: boolean } = {},
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
        activeOnly ? eq(employees.isActive, true) : undefined,
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
 * Total earnings + job count per active employee for the given business days.
 * Stylist: commission on closed ticket items (SQL ROUND, display only).
 * Clothier: sum of piece_rate for approved batch_pieces.
 * Secretary: daysWorked × daily_rate with ISO-week expected_work_days cap,
 *   excluding vacation/approved_absence days.
 *
 * activeOnly=true (default) excludes deactivated employees.
 */
export async function earningsByEmployee(
  db: Database,
  businessDayIds: string[],
  { activeOnly = true }: { activeOnly?: boolean } = {},
): Promise<EarningsByEmployee[]> {
  if (businessDayIds.length === 0) return [];

  const activeFilter = activeOnly ? eq(employees.isActive, true) : undefined;

  // Stylist earnings + job count
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
      jobCount: sql<number>`COUNT(DISTINCT ${tickets.id})::int`,
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
        activeFilter,
      ),
    )
    .groupBy(tickets.employeeId, users.name, employees.role);

  // Clothier earnings + job count (pieces)
  const clothierRows = await db
    .select({
      employeeId: batchPieces.assignedToEmployeeId,
      employeeName: users.name,
      role: employees.role,
      totalEarnings: sql<number>`COALESCE(SUM(${clothPieces.pieceRate}), 0)::bigint`,
      jobCount: sql<number>`COUNT(${batchPieces.id})::int`,
    })
    .from(batchPieces)
    .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
    .innerJoin(clothPieces, eq(batchPieces.clothPieceId, clothPieces.id))
    .innerJoin(employees, eq(batchPieces.assignedToEmployeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(
      and(
        inArray(clothBatches.businessDayId, businessDayIds),
        eq(batchPieces.status, "approved"),
        activeFilter,
      ),
    )
    .groupBy(batchPieces.assignedToEmployeeId, users.name, employees.role);

  const result = new Map<string, EarningsByEmployee>();

  for (const r of stylistRows) {
    result.set(r.employeeId, {
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      role: r.role,
      totalEarnings: Number(r.totalEarnings),
      jobCount: Number(r.jobCount),
    });
  }

  for (const r of clothierRows) {
    if (!r.employeeId) continue;
    const existing = result.get(r.employeeId);
    if (existing) {
      existing.totalEarnings += Number(r.totalEarnings);
      existing.jobCount += Number(r.jobCount);
    } else {
      result.set(r.employeeId, {
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        role: r.role,
        totalEarnings: Number(r.totalEarnings),
        jobCount: Number(r.jobCount),
      });
    }
  }

  // Secretary earnings: daysWorked × daily_rate with ISO-week cap (T08R-R2, T08R-R8)
  const secretaryEmps = await db
    .select({
      id: employees.id,
      name: users.name,
      dailyRate: employees.dailyRate,
      expectedWorkDays: employees.expectedWorkDays,
    })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(eq(employees.role, "secretary"), activeFilter));

  if (secretaryEmps.length > 0 && businessDayIds.length > 0) {
    const dayRows = await db
      .select({ id: businessDays.id, openedAt: businessDays.openedAt })
      .from(businessDays)
      .where(inArray(businessDays.id, businessDayIds));

    const dayDateMap = new Map(dayRows.map((d) => [d.id, toBogotaDate(new Date(d.openedAt))]));
    const allDateStrings = Array.from(dayDateMap.values());

    for (const sec of secretaryEmps) {
      if (!sec.dailyRate) continue;

      const absenceRows = allDateStrings.length
        ? await db
            .select({ date: employeeAbsences.date })
            .from(employeeAbsences)
            .where(
              and(
                eq(employeeAbsences.employeeId, sec.id),
                inArray(employeeAbsences.date, allDateStrings),
                or(
                  eq(employeeAbsences.type, "vacation"),
                  eq(employeeAbsences.type, "approved_absence"),
                ),
              ),
            )
        : [];

      const excludedDates = new Set(absenceRows.map((a) => a.date));

      // ISO-week cap: count present days per week, cap at expectedWorkDays
      const weekCounts = new Map<string, number>();
      for (const [, dateStr] of dayDateMap) {
        if (excludedDates.has(dateStr)) continue;
        const d = new Date(dateStr + "T12:00:00Z");
        const dow = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dow);
        const yr = d.getUTCFullYear();
        const wk = Math.ceil(((d.getTime() - Date.UTC(yr, 0, 1)) / 86400000 + 1) / 7);
        const key = `${yr}-W${String(wk).padStart(2, "0")}`;
        weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
      }

      let daysWorked = 0;
      for (const count of weekCounts.values()) {
        daysWorked += Math.min(count, sec.expectedWorkDays);
      }

      result.set(sec.id, {
        employeeId: sec.id,
        employeeName: sec.name,
        role: "secretary",
        totalEarnings: daysWorked * sec.dailyRate,
        jobCount: daysWorked,
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
    date: toBogotaDate(new Date(r.openedAt)),
    revenue: Number(r.revenue),
    jobs: Number(r.jobs),
  }));
}

// ─── Business days by period helper ──────────────────────────────────────────

export type PeriodDays = {
  current: string[];
  prior: string[];
};

function toBogotaDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/**
 * Returns business day IDs for the current and prior period.
 * Current window includes the open business day (if any) so today's in-progress
 * revenue is visible. Prior window is closed days only.
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
    // Resolved decision: weekly = previous calendar week Mon–Sun.
    // Current window: Mon → upcoming Sun (like-for-like vs prior full week).
    const dow = today.getDay() || 7; // Mon=1…Sun=7
    const monday = new Date(today);
    monday.setDate(monday.getDate() - (dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    currentStart = new Date(toBogotaDate(monday) + "T00:00:00-05:00");
    currentEnd = new Date(toBogotaDate(sunday) + "T23:59:59-05:00");
    const priorMonday = new Date(monday);
    priorMonday.setDate(priorMonday.getDate() - 7);
    const priorSunday = new Date(monday);
    priorSunday.setDate(priorSunday.getDate() - 1);
    priorStart = new Date(toBogotaDate(priorMonday) + "T00:00:00-05:00");
    priorEnd = new Date(toBogotaDate(priorSunday) + "T23:59:59-05:00");
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

  // Single query: fetch all days in the combined window.
  // Current: include open day (no closedAt filter) — shows live revenue.
  // Prior: closed only — in-progress days can't be compared meaningfully.
  const rows = await db
    .select({
      id: businessDays.id,
      openedAt: businessDays.openedAt,
      closedAt: businessDays.closedAt,
    })
    .from(businessDays)
    .where(
      sql`${businessDays.openedAt} >= ${priorStart.toISOString()}
        AND ${businessDays.openedAt} <= ${currentEnd.toISOString()}`,
    );

  const current = rows
    .filter((d) => d.openedAt >= currentStart && d.openedAt <= currentEnd)
    .map((d) => d.id);
  const prior = rows
    .filter((d) => d.closedAt !== null && d.openedAt >= priorStart && d.openedAt <= priorEnd)
    .map((d) => d.id);

  return { current, prior };
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
      date: toBogotaDate(new Date(r.openedAt)),
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
      date: toBogotaDate(new Date(r.openedAt)),
      jobs: Number(r.jobs),
      earnings: Number(r.earnings),
    }));
  }

  // Secretary — day-by-day breakdown (presence only; capping is per-week)
  const dayRows = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(inArray(businessDays.id, businessDayIds))
    .orderBy(businessDays.openedAt);

  const dateStrings = dayRows.map((d) => toBogotaDate(new Date(d.openedAt)));
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
    const dateStr = toBogotaDate(new Date(d.openedAt));
    const present = !excludedDates.has(dateStr);
    return {
      businessDayId: d.id,
      date: dateStr,
      jobs: present ? 1 : 0,
      earnings: present ? dailyRate : 0,
    };
  });
}
