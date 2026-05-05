"use server";

/**
 * Payroll server actions — T067, T068, T069, T070
 *
 * previewEarnings:          admin — compute earnings preview before committing
 * recordPayout:             admin — create payout record (T067) with double-pay check (T068)
 * listClosedBusinessDays:   admin — fetch closed business days for date selector
 * getUnsettledEmployees:    admin — employees with approved work and no covering payout (T070)
 * getMyEarnings:            any role — own earnings view gated by show_earnings (T069)
 * getPayoutHistory:         admin + own-view — payout records per employee
 */

import { headers } from "next/headers";
import { and, eq, inArray, not, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  employees,
  users,
  businessDays,
  employeeAbsences,
  payouts,
  payoutPeriodDays,
  payoutTicketItems,
  payoutCraftablePieces,
  ticketItems,
  craftablePieces,
  tickets,
  craftables,
} from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { recordPayoutSchema } from "@befine/types";
import { getUnpaidPastBusinessDays } from "@befine/db";
import { computeStylistEarnings } from "@/lib/payroll/compute-stylist-earnings";
import { computeClothierEarnings } from "@/lib/payroll/compute-clothier-earnings";
import { computeSecretaryEarnings } from "@/lib/payroll/compute-secretary-earnings";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BusinessDayOption = {
  id: string;
  date: string;
  isSettled: boolean;
};

export type EarningsPreview = {
  employeeId: string;
  employeeName: string;
  role: string;
  computedAmount: number;
  businessDayIds: string[];
  breakdown:
    | {
        type: "stylist";
        lines: import("@/lib/payroll/compute-stylist-earnings").StylistEarningsResult["lines"];
      }
    | {
        type: "clothier";
        lines: import("@/lib/payroll/compute-clothier-earnings").ClothierEarningsLine[];
      }
    | { type: "secretary"; daysWorked: number; dailyRate: number; expectedWorkDays: number };
};

export type PayoutRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  originalComputedAmount: number;
  adjustmentReason: string | null;
  method: string;
  paidAt: Date;
  periodDayCount: number;
  notes: string | null;
  createdAt: Date;
};

export type UnsettledEmployee = {
  employeeId: string;
  employeeName: string;
  role: string;
  unsettledDayCount: number;
  oldestUnsettledDate: string;
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { ok: false as const, code: "UNAUTHORIZED" as const, userId: null, user: null };
  if (!hasRole(session.user, "cashier_admin"))
    return { ok: false as const, code: "FORBIDDEN" as const, userId: null, user: null };
  return { ok: true as const, code: null, userId: session.user.id, user: session.user };
}

// ─── List closed business days ────────────────────────────────────────────────

export async function listClosedBusinessDays(
  employeeId?: string,
): Promise<ActionResult<BusinessDayOption[]>> {
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
  const rows = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(not(sql`${businessDays.closedAt} IS NULL`))
    .orderBy(businessDays.openedAt);

  // Get settled day IDs from the junction table — scoped to employee if provided
  const settledQuery = db
    .select({ businessDayId: payoutPeriodDays.businessDayId })
    .from(payoutPeriodDays);
  const settledRows = employeeId
    ? await settledQuery.where(eq(payoutPeriodDays.employeeId, employeeId))
    : await settledQuery;
  const settledIds = new Set(settledRows.map((r) => r.businessDayId));

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      date: new Date(r.openedAt).toISOString().slice(0, 10),
      isSettled: settledIds.has(r.id),
    })),
  };
}

// ─── Preview earnings (T067) ─────────────────────────────────────────────────

export async function previewEarnings(
  employeeId: string,
  businessDayIds: string[],
): Promise<ActionResult<EarningsPreview>> {
  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  if (!businessDayIds.length)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Selecciona al menos un día laboral" },
    };

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id, role: employees.role, name: users.name })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  let computedAmount = 0;
  let breakdown: EarningsPreview["breakdown"];

  if (emp.role === "stylist") {
    const result = await computeStylistEarnings(db, employeeId, businessDayIds);
    computedAmount = result.totalEarnings;
    breakdown = { type: "stylist", lines: result.lines };
  } else if (emp.role === "clothier") {
    const result = await computeClothierEarnings(db, employeeId, businessDayIds);
    computedAmount = result.totalEarnings;
    breakdown = { type: "clothier", lines: result.lines };
  } else {
    const result = await computeSecretaryEarnings(db, employeeId, businessDayIds);
    computedAmount = result.totalEarnings;
    breakdown = {
      type: "secretary",
      daysWorked: result.daysWorked,
      dailyRate: result.dailyRate,
      expectedWorkDays: result.expectedWorkDays,
    };
  }

  return {
    success: true,
    data: {
      employeeId,
      employeeName: emp.name,
      role: emp.role,
      computedAmount,
      businessDayIds,
      breakdown,
    },
  };
}

// ─── Record payout (T067 + T068 double-pay via junction unique constraint) ────

export async function recordPayout(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const rl = await checkRateLimit(rateLimits.payoutRecording, guard.userId!);
  if (!rl.allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = recordPayoutSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const input = parsed.data;

  if (input.amount !== input.originalComputedAmount && !input.adjustmentReason?.trim())
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Se requiere motivo cuando el monto difiere del calculado",
      },
    };

  const db = getDb();
  const [adminEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, guard.userId!))
    .limit(1);
  if (!adminEmp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  const [emp] = await db
    .select({ id: employees.id, role: employees.role })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  // Stabilization-1: block payouts that skip past unpaid days. If any unpaid
  // day is strictly older than the earliest day in this payout, the cashier
  // is paying out of order and must settle the prior gap first.
  const unpaid = await getUnpaidPastBusinessDays(db, input.employeeId);
  const targetIds = new Set(input.businessDayIds);
  const unpaidDates = unpaid.filter((d) => !targetIds.has(d.businessDayId)).map((d) => d.date);
  const targetDates = unpaid
    .filter((d) => targetIds.has(d.businessDayId))
    .map((d) => d.date)
    .sort();
  const earliestTarget = targetDates[0];
  if (earliestTarget && unpaidDates.some((d) => d < earliestTarget)) {
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message:
          "Hay días anteriores sin pagar para este empleado. Liquida primero los pendientes.",
      },
    };
  }

  const txDb = getTxDb();
  let payoutId: string;
  try {
    payoutId = await txDb.transaction(async (tx) => {
      // Idempotency: if this key already exists, return the existing payout
      const [existing] = await tx
        .select({ id: payouts.id })
        .from(payouts)
        .where(eq(payouts.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) return existing.id;

      const [payout] = await tx
        .insert(payouts)
        .values({
          idempotencyKey: input.idempotencyKey,
          employeeId: input.employeeId,
          amount: input.amount,
          originalComputedAmount: input.originalComputedAmount,
          adjustmentReason: input.adjustmentReason ?? null,
          method: input.method,
          recordedBy: adminEmp.id,
          notes: input.notes ?? null,
        })
        .returning({ id: payouts.id });

      // T068 + T07R-R1: insert period days — UNIQUE(employee_id, business_day_id) prevents
      // double-pay at DB level; conflict throws and rolls back the entire transaction.
      await tx.insert(payoutPeriodDays).values(
        input.businessDayIds.map((dayId) => ({
          payoutId: payout.id,
          employeeId: input.employeeId,
          businessDayId: dayId,
        })),
      );

      // Link covered ticket items (stylists)
      if (emp.role === "stylist") {
        const items = await tx
          .select({ id: ticketItems.id })
          .from(ticketItems)
          .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
          .where(
            and(
              eq(tickets.employeeId, input.employeeId),
              inArray(tickets.businessDayId, input.businessDayIds),
              eq(tickets.status, "closed"),
            ),
          );
        if (items.length > 0)
          await tx
            .insert(payoutTicketItems)
            .values(items.map((item) => ({ payoutId: payout.id, ticketItemId: item.id })));
      }

      // Link covered craftable pieces (clothiers)
      if (emp.role === "clothier") {
        const pieces = await tx
          .select({ id: craftablePieces.id })
          .from(craftablePieces)
          .innerJoin(craftables, eq(craftablePieces.craftableId, craftables.id))
          .where(
            and(
              eq(craftablePieces.assignedToEmployeeId, input.employeeId),
              eq(craftablePieces.status, "approved"),
              inArray(craftables.businessDayId, input.businessDayIds),
            ),
          );
        if (pieces.length > 0)
          await tx
            .insert(payoutCraftablePieces)
            .values(pieces.map((p) => ({ payoutId: payout.id, craftablePieceId: p.id })));
      }

      return payout.id;
    });
  } catch (err) {
    // Postgres unique violation on payout_period_days = double-pay attempt
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return {
        success: false,
        error: {
          code: "CONFLICT",
          message: "Uno o más días seleccionados ya están liquidados para este empleado.",
        },
      };
    }
    throw err;
  }

  revalidatePath("/admin/payroll");
  return { success: true, data: { id: payoutId } };
}

// ─── Payout history (admin) ───────────────────────────────────────────────────

export async function listPayouts(employeeId?: string): Promise<ActionResult<PayoutRow[]>> {
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
  const rows = await db
    .select({
      id: payouts.id,
      employeeId: payouts.employeeId,
      employeeName: users.name,
      amount: payouts.amount,
      originalComputedAmount: payouts.originalComputedAmount,
      adjustmentReason: payouts.adjustmentReason,
      method: payouts.method,
      paidAt: payouts.paidAt,
      notes: payouts.notes,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(employees, eq(payouts.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(employeeId ? eq(payouts.employeeId, employeeId) : undefined)
    .orderBy(payouts.paidAt);

  // Count covered days per payout from junction table
  const dayCountRows = await db
    .select({
      payoutId: payoutPeriodDays.payoutId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(payoutPeriodDays)
    .where(
      rows.length > 0
        ? inArray(
            payoutPeriodDays.payoutId,
            rows.map((r) => r.id),
          )
        : sql`false`,
    )
    .groupBy(payoutPeriodDays.payoutId);

  const countMap = new Map(dayCountRows.map((r) => [r.payoutId, r.cnt]));

  return {
    success: true,
    data: rows.map((r) => ({ ...r, periodDayCount: countMap.get(r.id) ?? 0 })),
  };
}

// ─── Unsettled employees alert (T070) ────────────────────────────────────────

export async function getUnsettledEmployees(): Promise<ActionResult<UnsettledEmployee[]>> {
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

  // Closed business days
  const closedDays = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(not(sql`${businessDays.closedAt} IS NULL`));

  if (!closedDays.length) return { success: true, data: [] };

  // Settled day IDs per employee from junction table (T07R-R3)
  const periodRows = await db
    .select({
      employeeId: payoutPeriodDays.employeeId,
      businessDayId: payoutPeriodDays.businessDayId,
    })
    .from(payoutPeriodDays);

  const settledMap = new Map<string, Set<string>>();
  for (const p of periodRows) {
    if (!settledMap.has(p.employeeId)) settledMap.set(p.employeeId, new Set());
    settledMap.get(p.employeeId)!.add(p.businessDayId);
  }

  const closedDayIds = closedDays.map((d) => d.id);

  // Active employees (not admin)
  const empRows = await db
    .select({ id: employees.id, role: employees.role, name: users.name })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(eq(employees.isActive, true), not(eq(employees.role, "cashier_admin"))));

  const result: UnsettledEmployee[] = [];

  for (const emp of empRows) {
    const settled = settledMap.get(emp.id) ?? new Set();
    let unsettledDays: typeof closedDays = [];

    if (emp.role === "stylist") {
      const workDays = await db
        .selectDistinct({ businessDayId: tickets.businessDayId })
        .from(tickets)
        .where(
          and(
            eq(tickets.employeeId, emp.id),
            eq(tickets.status, "closed"),
            inArray(tickets.businessDayId, closedDayIds),
          ),
        );
      unsettledDays = closedDays.filter(
        (d) => workDays.some((w) => w.businessDayId === d.id) && !settled.has(d.id),
      );
    } else if (emp.role === "clothier") {
      const workDays = await db
        .selectDistinct({ businessDayId: craftables.businessDayId })
        .from(craftablePieces)
        .innerJoin(craftables, eq(craftablePieces.craftableId, craftables.id))
        .where(
          and(
            eq(craftablePieces.assignedToEmployeeId, emp.id),
            eq(craftablePieces.status, "approved"),
            inArray(craftables.businessDayId, closedDayIds),
          ),
        );
      unsettledDays = closedDays.filter(
        (d) => workDays.some((w) => w.businessDayId === d.id) && !settled.has(d.id),
      );
    } else {
      // Secretary: closed days not yet settled, excluding vacation + approved_absence (T07R-R4)
      const dateStrings = closedDays.map((d) => new Date(d.openedAt).toISOString().slice(0, 10));
      const absenceRows = await db
        .select({ date: employeeAbsences.date })
        .from(employeeAbsences)
        .where(
          and(
            eq(employeeAbsences.employeeId, emp.id),
            inArray(employeeAbsences.date, dateStrings),
            sql`${employeeAbsences.type} IN ('vacation', 'approved_absence')`,
          ),
        );
      const excludedDates = new Set(absenceRows.map((a) => a.date));
      unsettledDays = closedDays.filter((d) => {
        const dateStr = new Date(d.openedAt).toISOString().slice(0, 10);
        return !settled.has(d.id) && !excludedDates.has(dateStr);
      });
    }

    if (unsettledDays.length > 0) {
      const dates = unsettledDays.map((d) => new Date(d.openedAt).toISOString().slice(0, 10));
      result.push({
        employeeId: emp.id,
        employeeName: emp.name,
        role: emp.role,
        unsettledDayCount: unsettledDays.length,
        oldestUnsettledDate: dates.sort()[0],
      });
    }
  }

  return {
    success: true,
    data: result.sort((a, b) => a.oldestUnsettledDate.localeCompare(b.oldestUnsettledDate)),
  };
}

// ─── My earnings (T069 — gated by show_earnings) ─────────────────────────────

export type MyEarningsSummary = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  payoutHistory: PayoutRow[];
};

export async function getMyEarnings(): Promise<ActionResult<MyEarningsSummary>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const db = getDb();
  const [emp] = await db
    .select({
      id: employees.id,
      role: employees.role,
      showEarnings: employees.showEarnings,
    })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!emp || !emp.showEarnings)
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  // Fetch recent closed business days — today, this week (ISO Mon), this month
  // All boundaries anchored to America/Bogota to match the business day (T07R-R7)
  const { todayInBogota, isoWeekStartInBogota, monthStartInBogota } = await import("@/lib/dates");
  const todayStr = todayInBogota();
  const weekStart = isoWeekStartInBogota();
  const monthStart = monthStartInBogota();

  const closedDays = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(not(sql`${businessDays.closedAt} IS NULL`));

  // T07R-R6: exclude already-paid days from summaries
  const paidDayRows = await db
    .select({ businessDayId: payoutPeriodDays.businessDayId })
    .from(payoutPeriodDays)
    .where(eq(payoutPeriodDays.employeeId, emp.id));
  const paidDayIds = new Set(paidDayRows.map((r) => r.businessDayId));

  function filterDays(from: Date) {
    return closedDays
      .filter((d) => new Date(d.openedAt) >= from && !paidDayIds.has(d.id))
      .map((d) => d.id);
  }

  const todayDays = filterDays(new Date(todayStr));
  const weekDays = filterDays(weekStart);
  const monthDays = filterDays(monthStart);

  let todayAmt = 0;
  let weekAmt = 0;
  let monthAmt = 0;

  if (emp.role === "stylist") {
    const [t, w, m] = await Promise.all([
      computeStylistEarnings(db, emp.id, todayDays),
      computeStylistEarnings(db, emp.id, weekDays),
      computeStylistEarnings(db, emp.id, monthDays),
    ]);
    todayAmt = t.totalEarnings;
    weekAmt = w.totalEarnings;
    monthAmt = m.totalEarnings;
  } else if (emp.role === "clothier") {
    const [t, w, m] = await Promise.all([
      computeClothierEarnings(db, emp.id, todayDays),
      computeClothierEarnings(db, emp.id, weekDays),
      computeClothierEarnings(db, emp.id, monthDays),
    ]);
    todayAmt = t.totalEarnings;
    weekAmt = w.totalEarnings;
    monthAmt = m.totalEarnings;
  } else {
    const [t, w, m] = await Promise.all([
      computeSecretaryEarnings(db, emp.id, todayDays),
      computeSecretaryEarnings(db, emp.id, weekDays),
      computeSecretaryEarnings(db, emp.id, monthDays),
    ]);
    todayAmt = t.totalEarnings;
    weekAmt = w.totalEarnings;
    monthAmt = m.totalEarnings;
  }

  // Payout history
  const history = await db
    .select({
      id: payouts.id,
      employeeId: payouts.employeeId,
      employeeName: users.name,
      amount: payouts.amount,
      originalComputedAmount: payouts.originalComputedAmount,
      adjustmentReason: payouts.adjustmentReason,
      method: payouts.method,
      paidAt: payouts.paidAt,
      notes: payouts.notes,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(employees, eq(payouts.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(payouts.employeeId, emp.id))
    .orderBy(payouts.paidAt);

  // Day counts per payout
  const dayCounts = await db
    .select({ payoutId: payoutPeriodDays.payoutId, cnt: sql<number>`count(*)::int` })
    .from(payoutPeriodDays)
    .where(
      history.length > 0
        ? inArray(
            payoutPeriodDays.payoutId,
            history.map((h) => h.id),
          )
        : sql`false`,
    )
    .groupBy(payoutPeriodDays.payoutId);
  const dayCountMap = new Map(dayCounts.map((r) => [r.payoutId, r.cnt]));

  return {
    success: true,
    data: {
      today: todayAmt,
      thisWeek: weekAmt,
      thisMonth: monthAmt,
      payoutHistory: history.map((h) => ({ ...h, periodDayCount: dayCountMap.get(h.id) ?? 0 })),
    },
  };
}

// ─── Payout status grid (Stabilization-1) ────────────────────────────────────

export type PayoutStatusRow = {
  businessDayId: string;
  date: string;
  /** "paid" = covered by a payout, "pending" = closed but not yet paid, "open" = not yet closed */
  status: "paid" | "pending" | "open";
};

export async function getPayoutStatusGrid(
  employeeId: string,
): Promise<ActionResult<PayoutStatusRow[]>> {
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

  // Last 14 business days ordered newest-first
  const recent = await db
    .select({
      id: businessDays.id,
      openedAt: businessDays.openedAt,
      closedAt: businessDays.closedAt,
    })
    .from(businessDays)
    .orderBy(sql`${businessDays.openedAt} DESC`)
    .limit(14);

  if (recent.length === 0) return { success: true, data: [] };

  const recentIds = recent.map((d) => d.id);

  const settledRows = await db
    .select({ businessDayId: payoutPeriodDays.businessDayId })
    .from(payoutPeriodDays)
    .where(
      and(
        eq(payoutPeriodDays.employeeId, employeeId),
        inArray(payoutPeriodDays.businessDayId, recentIds),
      ),
    );
  const settledIds = new Set(settledRows.map((r) => r.businessDayId));

  return {
    success: true,
    data: recent.map((d) => ({
      businessDayId: d.id,
      date: new Date(d.openedAt).toISOString().slice(0, 10),
      status: settledIds.has(d.id) ? "paid" : d.closedAt ? "pending" : "open",
    })),
  };
}
