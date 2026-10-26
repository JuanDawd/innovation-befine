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
 * markPayoutReviewed:       admin — clear a payout's needs_review flag (M-28)
 */

import { headers } from "next/headers";
import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
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
  payoutProductPieces,
  payoutUnitReviews,
  ticketItems,
  productPieces,
  tickets,
  products,
  assignments,
  unitReviews,
} from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { markPayoutReviewedSchema, recordPayoutSchema } from "@befine/types";
import { getUnpaidPastBusinessDays, type Database } from "@befine/db";
import { clothierClosingBlocks, closingBlockMessage } from "@/lib/payroll/clothier-closing-gate";
import { computeStylistEarnings, earningsLineLabel } from "@/lib/payroll/compute-stylist-earnings";
import { earningsPeriods } from "@/lib/payroll/my-earnings-days";
import { checkPayout } from "@/lib/payroll/payout-check";
import { computeEarningsTotal } from "@/lib/payroll/compute-total";
import { computeClothierEarnings, payoutReviewIds } from "@/lib/payroll/compute-clothier-earnings";
import { computeSecretaryEarnings } from "@/lib/payroll/compute-secretary-earnings";
import { businessDateOf } from "@/lib/dates";
import { isUniqueViolation } from "@/lib/pg-error";
import { actorOf, logActivity } from "@/lib/activity";
import { formatPesos } from "@befine/db";

const METHOD_ES = { cash: "efectivo", card: "tarjeta", transfer: "transferencia" } as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type BusinessDayOption = {
  id: string;
  /** Bogota calendar date (YYYY-MM-DD). Not unique: a day can be closed and reopened. */
  date: string;
  /** ISO timestamp — tells apart two business days on the same date. */
  openedAt: string;
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
  /** T126 — clothiers: why these days cannot be settled yet (closing missing or unapproved) */
  closingBlock: string | null;
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
  needsReview: boolean;
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
  if (!hasRole(session.user, "admin"))
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
      date: businessDateOf(r.openedAt),
      openedAt: new Date(r.openedAt).toISOString(),
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
  let closingBlock: string | null = null;

  if (emp.role === "stylist") {
    const result = await computeStylistEarnings(db, employeeId, businessDayIds);
    computedAmount = result.totalEarnings;
    breakdown = { type: "stylist", lines: result.lines };
  } else if (emp.role === "clothier") {
    const [result, blocks] = await Promise.all([
      computeClothierEarnings(db, employeeId, businessDayIds),
      clothierClosingBlocks(db, employeeId, businessDayIds),
    ]);
    computedAmount = result.totalEarnings;
    breakdown = { type: "clothier", lines: result.lines };
    closingBlock = closingBlockMessage(emp.name, blocks);
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
      closingBlock,
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

  const db = getDb();
  const [adminEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, guard.userId!))
    .limit(1);
  if (!adminEmp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  const [emp] = await db
    .select({ id: employees.id, role: employees.role, name: users.name })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  // T126 — a clothier's day is settled only after her closing is approved.
  if (emp.role === "clothier") {
    const block = closingBlockMessage(
      emp.name,
      await clothierClosingBlocks(db, input.employeeId, input.businessDayIds),
    );
    if (block) return { success: false, error: { code: "CONFLICT", message: block } };
  }

  // H-59: never trust the preview the client saw — recompute for these days.
  const serverComputedAmount = await computeEarningsTotal(
    db,
    emp.role,
    input.employeeId,
    input.businessDayIds,
  );
  const checkError = checkPayout({ ...input, serverComputedAmount });
  if (checkError) return { success: false, error: checkError };

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
          originalComputedAmount: serverComputedAmount,
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

      // Link covered product pieces (clothiers)
      if (emp.role === "clothier") {
        const pieces = await tx
          .select({ id: productPieces.id })
          .from(productPieces)
          .innerJoin(products, eq(productPieces.productId, products.id))
          .where(
            and(
              eq(productPieces.assignedToEmployeeId, input.employeeId),
              eq(productPieces.status, "approved"),
              inArray(productPieces.approvedBusinessDayId, input.businessDayIds),
            ),
          );
        if (pieces.length > 0)
          await tx
            .insert(payoutProductPieces)
            .values(pieces.map((p) => ({ payoutId: payout.id, productPieceId: p.id })));

        // T126: the pedido unit reviews this payout pays. UNIQUE(unit_review_id)
        // makes a second payout of the same review fail and roll back.
        const reviewIds = payoutReviewIds(
          (
            await computeClothierEarnings(
              tx as unknown as Database,
              input.employeeId,
              input.businessDayIds,
            )
          ).lines,
        );
        if (reviewIds.length > 0)
          await tx
            .insert(payoutUnitReviews)
            .values(reviewIds.map((id) => ({ payoutId: payout.id, unitReviewId: id })));
      }

      // T131 — logged with the employee's name, the days and how it differs from the computed figure.
      const [who] = await tx
        .select({ name: users.name })
        .from(employees)
        .innerJoin(users, eq(users.id, employees.userId))
        .where(eq(employees.id, input.employeeId));
      const adjusted = input.amount !== serverComputedAmount;
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "payroll.payout",
        entityType: "employee",
        entityId: input.employeeId,
        summary:
          `Liquidó ${formatPesos(input.amount)} (${METHOD_ES[input.method]}) a ${who?.name ?? "—"} por ` +
          `${input.businessDayIds.length === 1 ? "1 día" : `${input.businessDayIds.length} días`}` +
          (adjusted ? ` · calculado ${formatPesos(serverComputedAmount)}` : ""),
        after: {
          payoutId: payout.id,
          amount: input.amount,
          computed: serverComputedAmount,
          businessDayIds: input.businessDayIds,
          method: input.method,
        },
        reason: input.adjustmentReason ?? null,
      });

      return payout.id;
    });
  } catch (err) {
    // Postgres unique violation on payout_period_days = double-pay attempt
    if (isUniqueViolation(err)) {
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
      needsReview: payouts.needsReview,
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

// ─── Payout review (M-28) ─────────────────────────────────────────────────────

/** Clears needs_review once the admin has checked a payout after a ticket reopen. */
export async function markPayoutReviewed(rawPayoutId: unknown): Promise<ActionResult<null>> {
  const parsed = markPayoutReviewedSchema.safeParse({ payoutId: rawPayoutId });
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const guard = await requireAdmin();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const rl = await checkRateLimit(rateLimits.general, guard.userId);
  if (!rl.allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const updated = await getTxDb().transaction(async (tx) => {
    const [row] = await tx
      .update(payouts)
      .set({ needsReview: false })
      .where(eq(payouts.id, parsed.data.payoutId))
      .returning({ id: payouts.id, employeeId: payouts.employeeId });
    if (row)
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "payroll.payout_review",
        entityType: "employee",
        entityId: row.employeeId,
        after: { payoutId: row.id, needsReview: false },
      });
    return row;
  });
  if (!updated)
    return { success: false, error: { code: "NOT_FOUND", message: "Pago no encontrado" } };

  revalidatePath("/admin/payroll");
  return { success: true, data: null };
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
    .where(and(eq(employees.isActive, true), not(eq(employees.role, "admin"))));

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
      const [pieceDays, reviewDays] = await Promise.all([
        db
          .selectDistinct({ businessDayId: productPieces.approvedBusinessDayId })
          .from(productPieces)
          .innerJoin(products, eq(productPieces.productId, products.id))
          .where(
            and(
              eq(productPieces.assignedToEmployeeId, emp.id),
              eq(productPieces.status, "approved"),
              inArray(productPieces.approvedBusinessDayId, closedDayIds),
            ),
          ),
        // T126: days with reviewed pedido units (approved, or scrapped and paid)
        db
          .selectDistinct({ businessDayId: unitReviews.businessDayId })
          .from(unitReviews)
          .innerJoin(assignments, eq(unitReviews.assignmentId, assignments.id))
          .where(
            and(
              eq(assignments.employeeId, emp.id),
              inArray(unitReviews.businessDayId, closedDayIds),
              sql`(${unitReviews.approved} > 0 OR (${unitReviews.scrapPaid} AND ${unitReviews.scrapped} > 0))`,
            ),
          ),
      ]);
      const workDays = [...pieceDays, ...reviewDays];
      unsettledDays = closedDays.filter(
        (d) => workDays.some((w) => w.businessDayId === d.id) && !settled.has(d.id),
      );
    } else {
      // Secretary: closed days not yet settled, excluding vacation + approved_absence (T07R-R4)
      const dateStrings = closedDays.map((d) => businessDateOf(d.openedAt));
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
        const dateStr = businessDateOf(d.openedAt);
        return !settled.has(d.id) && !excludedDates.has(dateStr);
      });
    }

    if (unsettledDays.length > 0) {
      const dates = unsettledDays.map((d) => businessDateOf(d.openedAt));
      result.push({
        employeeId: emp.id,
        employeeName: emp.name,
        role: emp.role,
        // Distinct dates — a closed-and-reopened day is still one day to settle
        unsettledDayCount: new Set(dates).size,
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

export type MyEarningsLine = {
  label: string;
  quantity: number;
  basis: { kind: "commission"; pct: number; price: number } | { kind: "pieceRate"; rate: number };
  amount: number;
};

export type MyEarningsSummary = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  /** Part of the totals earned on the business day still open — final at close; null when no day is open */
  inProgress: number | null;
  /** What makes up "Hoy" — empty for the daily-rate model */
  todayLines: MyEarningsLine[];
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

  // Every business day, open or closed — the open one is today's work in
  // progress, so "Hoy" isn't $0 until close. Periods use Bogota dates (T07R-R7).
  const { todayInBogota } = await import("@/lib/dates");
  const allDays = await db
    .select({
      id: businessDays.id,
      openedAt: businessDays.openedAt,
      closedAt: businessDays.closedAt,
    })
    .from(businessDays);

  // T07R-R6: exclude already-paid days from summaries
  const paidDayRows = await db
    .select({ businessDayId: payoutPeriodDays.businessDayId })
    .from(payoutPeriodDays)
    .where(eq(payoutPeriodDays.employeeId, emp.id));
  const paidDayIds = new Set(paidDayRows.map((r) => r.businessDayId));

  const periods = earningsPeriods(allDays, paidDayIds, todayInBogota());
  const openDays = periods.openDayId ? [periods.openDayId] : [];

  let todayAmt = 0;
  let weekAmt = 0;
  let monthAmt = 0;
  let openAmt = 0;
  let todayLines: MyEarningsLine[] = [];

  if (emp.role === "stylist") {
    const [t, w, m, o] = await Promise.all([
      computeStylistEarnings(db, emp.id, periods.today),
      computeStylistEarnings(db, emp.id, periods.week),
      computeStylistEarnings(db, emp.id, periods.month),
      computeStylistEarnings(db, emp.id, openDays),
    ]);
    [todayAmt, weekAmt, monthAmt, openAmt] = [t, w, m, o].map((r) => r.totalEarnings);
    todayLines = t.lines.flatMap((l) =>
      l.excluded
        ? []
        : [
            {
              label: l.serviceName ?? "—",
              quantity: l.quantity,
              basis: { kind: "commission" as const, pct: l.commissionPct, price: l.effectivePrice },
              amount: l.earnings,
            },
          ],
    );
  } else if (emp.role === "clothier") {
    const [t, w, m, o] = await Promise.all([
      computeClothierEarnings(db, emp.id, periods.today),
      computeClothierEarnings(db, emp.id, periods.week),
      computeClothierEarnings(db, emp.id, periods.month),
      computeClothierEarnings(db, emp.id, openDays),
    ]);
    [todayAmt, weekAmt, monthAmt, openAmt] = [t, w, m, o].map((r) => r.totalEarnings);
    // Same lines the cashier settles (T126): pedido, size, and why it is paid.
    todayLines = t.lines.map((l) => ({
      label:
        earningsLineLabel(l.pieceName, l.variantName) +
        (l.source === "pedido"
          ? ` · #${String(l.pedidoNumber).padStart(4, "0")} · talla ${l.sizeLabel}` +
            (l.kind === "scrapped" ? " · descartadas (se pagan)" : "")
          : ""),
      quantity: l.quantity,
      basis: { kind: "pieceRate" as const, rate: l.pieceRate },
      amount: l.earnings,
    }));
  } else {
    const [t, w, m, o] = await Promise.all([
      computeSecretaryEarnings(db, emp.id, periods.today),
      computeSecretaryEarnings(db, emp.id, periods.week),
      computeSecretaryEarnings(db, emp.id, periods.month),
      computeSecretaryEarnings(db, emp.id, openDays),
    ]);
    [todayAmt, weekAmt, monthAmt, openAmt] = [t, w, m, o].map((r) => r.totalEarnings);
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
      needsReview: payouts.needsReview,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(employees, eq(payouts.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(payouts.employeeId, emp.id))
    .orderBy(desc(payouts.paidAt));

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
      inProgress: periods.openDayId ? openAmt : null,
      todayLines,
      payoutHistory: history.map((h) => ({ ...h, periodDayCount: dayCountMap.get(h.id) ?? 0 })),
    },
  };
}

// ─── Payout status grid (Stabilization-1) ────────────────────────────────────

export type PayoutStatusRow = {
  businessDayId: string;
  date: string;
  openedAt: string;
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
      date: businessDateOf(d.openedAt),
      openedAt: new Date(d.openedAt).toISOString(),
      status: settledIds.has(d.id) ? "paid" : d.closedAt ? "pending" : "open",
    })),
  };
}
