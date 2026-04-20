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
  payouts,
  payoutTicketItems,
  payoutBatchPieces,
  ticketItems,
  batchPieces,
  tickets,
  clothBatches,
} from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
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
  periodBusinessDayIds: string[];
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

export async function listClosedBusinessDays(): Promise<ActionResult<BusinessDayOption[]>> {
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

  // Get all settled business day IDs (already covered by a payout)
  const settledRows = await db.select({ ids: payouts.periodBusinessDayIds }).from(payouts);
  const settledIds = new Set(settledRows.flatMap((r) => r.ids));

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

// ─── Record payout (T067 + T068 double-pay check) ────────────────────────────

export async function recordPayout(rawInput: {
  employeeId: string;
  businessDayIds: string[];
  amount: number;
  originalComputedAmount: number;
  adjustmentReason?: string;
  method: "cash" | "card" | "transfer";
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
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

  if (!rawInput.businessDayIds.length)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Selecciona al menos un día laboral" },
    };

  if (rawInput.amount !== rawInput.originalComputedAmount && !rawInput.adjustmentReason?.trim())
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

  // T068: double-pay check — find any existing payout for this employee that covers any of the selected days
  const existingPayouts = await db
    .select({ id: payouts.id, periodBusinessDayIds: payouts.periodBusinessDayIds })
    .from(payouts)
    .where(eq(payouts.employeeId, rawInput.employeeId));

  const conflictPayoutIds: string[] = [];
  const conflictDayIds: string[] = [];

  for (const existing of existingPayouts) {
    const overlap = rawInput.businessDayIds.filter((id) =>
      existing.periodBusinessDayIds.includes(id),
    );
    if (overlap.length > 0) {
      conflictPayoutIds.push(existing.id);
      conflictDayIds.push(...overlap);
    }
  }

  if (conflictDayIds.length > 0)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `Días ya liquidados: ${conflictDayIds.join(", ")}. Pagos previos: ${[...new Set(conflictPayoutIds)].join(", ")}`,
      },
    };

  const [emp] = await db
    .select({ id: employees.id, role: employees.role })
    .from(employees)
    .where(eq(employees.id, rawInput.employeeId))
    .limit(1);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  const txDb = getTxDb();
  const payoutId = await txDb.transaction(async (tx) => {
    const [payout] = await tx
      .insert(payouts)
      .values({
        employeeId: rawInput.employeeId,
        amount: rawInput.amount,
        originalComputedAmount: rawInput.originalComputedAmount,
        adjustmentReason: rawInput.adjustmentReason ?? null,
        method: rawInput.method,
        periodBusinessDayIds: rawInput.businessDayIds,
        recordedBy: adminEmp.id,
        notes: rawInput.notes ?? null,
      })
      .returning({ id: payouts.id });

    // Link covered ticket items (stylists)
    if (emp.role === "stylist") {
      const items = await tx
        .select({ id: ticketItems.id })
        .from(ticketItems)
        .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
        .where(
          and(
            eq(tickets.employeeId, rawInput.employeeId),
            inArray(tickets.businessDayId, rawInput.businessDayIds),
            eq(tickets.status, "closed"),
          ),
        );
      if (items.length > 0) {
        await tx
          .insert(payoutTicketItems)
          .values(items.map((item) => ({ payoutId: payout.id, ticketItemId: item.id })));
      }
    }

    // Link covered batch pieces (clothiers)
    if (emp.role === "clothier") {
      const pieces = await tx
        .select({ id: batchPieces.id })
        .from(batchPieces)
        .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
        .where(
          and(
            eq(batchPieces.assignedToEmployeeId, rawInput.employeeId),
            eq(batchPieces.status, "approved"),
            inArray(clothBatches.businessDayId, rawInput.businessDayIds),
          ),
        );
      if (pieces.length > 0) {
        await tx
          .insert(payoutBatchPieces)
          .values(pieces.map((p) => ({ payoutId: payout.id, batchPieceId: p.id })));
      }
    }

    return payout.id;
  });

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
      periodBusinessDayIds: payouts.periodBusinessDayIds,
      notes: payouts.notes,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(employees, eq(payouts.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(employeeId ? eq(payouts.employeeId, employeeId) : undefined)
    .orderBy(payouts.paidAt);

  return { success: true, data: rows };
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

  // Settled day IDs per employee
  const payoutRows = await db
    .select({ employeeId: payouts.employeeId, periodBusinessDayIds: payouts.periodBusinessDayIds })
    .from(payouts);

  const settledMap = new Map<string, Set<string>>();
  for (const p of payoutRows) {
    if (!settledMap.has(p.employeeId)) settledMap.set(p.employeeId, new Set());
    for (const id of p.periodBusinessDayIds) settledMap.get(p.employeeId)!.add(id);
  }

  const closedDayIds = closedDays.map((d) => d.id);

  // Active employees
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
      // Has closed tickets in unsettled days?
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
      // Has approved pieces in unsettled days?
      const workDays = await db
        .selectDistinct({ businessDayId: clothBatches.businessDayId })
        .from(batchPieces)
        .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
        .where(
          and(
            eq(batchPieces.assignedToEmployeeId, emp.id),
            eq(batchPieces.status, "approved"),
            inArray(clothBatches.businessDayId, closedDayIds),
          ),
        );
      unsettledDays = closedDays.filter(
        (d) => workDays.some((w) => w.businessDayId === d.id) && !settled.has(d.id),
      );
    } else {
      // Secretary: any closed day they weren't absent is work
      unsettledDays = closedDays.filter((d) => !settled.has(d.id));
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

  // Fetch recent closed business days — today, this week, this month
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const closedDays = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(not(sql`${businessDays.closedAt} IS NULL`));

  function filterDays(from: Date) {
    return closedDays.filter((d) => new Date(d.openedAt) >= from).map((d) => d.id);
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
      periodBusinessDayIds: payouts.periodBusinessDayIds,
      notes: payouts.notes,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(employees, eq(payouts.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(payouts.employeeId, emp.id))
    .orderBy(payouts.paidAt);

  return {
    success: true,
    data: { today: todayAmt, thisWeek: weekAmt, thisMonth: monthAmt, payoutHistory: history },
  };
}
