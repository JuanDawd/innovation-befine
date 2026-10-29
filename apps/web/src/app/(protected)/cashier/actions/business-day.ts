"use server";

/**
 * Business day server actions — T019
 *
 * Open, close, and reopen the business day.
 * All actions require cashier or admin role.
 * Financial constraint: only one open day at a time (enforced at DB level too).
 * H-49: a day can't be closed while it has unpaid tickets — they would become
 * unreachable from Cobrar. The cashier charges them or voids them first.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, desc, isNotNull, inArray, notExists, count, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { businessDays, tickets } from "@befine/db/schema";
import { reopenBusinessDaySchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import type { BusinessDay } from "@/lib/business-day";
import { hasRole } from "@/lib/middleware-helpers";
import { attachAfterHoursPayments } from "@/lib/after-hours";
import { actorOf, logActivity } from "@/lib/activity";
import { formatPesos, getDayIncome, type Database } from "@befine/db";
import { financialBreadcrumb, reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// Open business day
// ---------------------------------------------------------------------------

export async function openBusinessDay(): Promise<ActionResult<BusinessDay>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier", "admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  // One statement (M-62): insert only if no day is open. The partial unique
  // index uq_business_days_single_open is the real safety net — this also
  // holds where it is missing (H-48).
  const rows = await getTxDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(businessDays)
      .select(
        tx
          .select({
            id: sql`gen_random_uuid()`.as("id"),
            openedAt: sql`now()`.as("opened_at"),
            closedAt: sql`NULL::timestamptz`.as("closed_at"),
            openedBy: sql`${session.user.id}`.as("opened_by"),
            closedBy: sql`NULL`.as("closed_by"),
            reopenedBy: sql`NULL`.as("reopened_by"),
            reopenedAt: sql`NULL::timestamptz`.as("reopened_at"),
            reopenReason: sql`NULL`.as("reopen_reason"),
            createdAt: sql`now()`.as("created_at"),
            updatedAt: sql`now()`.as("updated_at"),
          })
          .from(sql`(SELECT 1) AS one`)
          .where(
            notExists(
              tx
                .select({ id: businessDays.id })
                .from(businessDays)
                .where(isNull(businessDays.closedAt)),
            ),
          ),
      )
      .returning();
    if (inserted[0])
      await logActivity(tx, {
        actor: actorOf(session.user),
        action: "day.open",
        entityType: "business_day",
        entityId: inserted[0].id,
        businessDayId: inserted[0].id,
      });
    return inserted;
  });

  if (rows.length === 0) {
    return {
      success: false,
      error: { code: "CONFLICT", message: "Ya hay un día abierto" },
    };
  }

  const day = rows[0];
  if (!day) {
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Error al abrir el día" } };
  }

  // T127: after-hours pedido payments belong to the day that opens next.
  // Idempotent, so a failure here is retried on the next open or payment read.
  await attachAfterHoursPayments(day.id, actorOf(session.user)).catch((err) =>
    reportError(err, "attachAfterHoursPayments", { businessDayId: day.id }),
  );

  revalidatePath("/cashier");
  financialBreadcrumb("openBusinessDay", { businessDayId: day.id });
  return { success: true, data: day };
}

// ---------------------------------------------------------------------------
// Close business day
// ---------------------------------------------------------------------------

/** Tickets in these states still need the cashier — charge, re-charge, or void. */
const UNPAID_STATUSES: ("logged" | "awaiting_payment" | "reopened")[] = [
  "logged",
  "awaiting_payment",
  "reopened",
];

export async function closeBusinessDay(businessDayId: string): Promise<ActionResult<BusinessDay>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier", "admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();

  // Single statement so a ticket logged between a check and the update can't
  // slip through. Logged with the day's till total in the same transaction.
  const unpaid = and(
    eq(tickets.businessDayId, businessDayId),
    inArray(tickets.status, UNPAID_STATUSES),
  );
  const rows = await getTxDb().transaction(async (tx) => {
    const updated = await tx
      .update(businessDays)
      .set({
        closedAt: new Date(),
        closedBy: session.user.id,
      })
      .where(
        and(
          eq(businessDays.id, businessDayId),
          isNull(businessDays.closedAt),
          notExists(tx.select({ id: tickets.id }).from(tickets).where(unpaid)),
        ),
      )
      .returning();
    if (updated[0]) {
      const income = await getDayIncome(tx as unknown as Database, businessDayId);
      await logActivity(tx, {
        actor: actorOf(session.user),
        action: "day.close",
        entityType: "business_day",
        entityId: businessDayId,
        businessDayId,
        data: { amount: formatPesos(income.total) },
        after: { total: income.total, bySource: income.bySource, afterHours: income.afterHours },
      });
    }
    return updated;
  });

  const day = rows[0];
  if (!day) {
    const [existing] = await db
      .select({ closedAt: businessDays.closedAt })
      .from(businessDays)
      .where(eq(businessDays.id, businessDayId))
      .limit(1);
    if (!existing) {
      return { success: false, error: { code: "NOT_FOUND", message: "Día no encontrado" } };
    }
    if (existing.closedAt) {
      return { success: false, error: { code: "CONFLICT", message: "El día ya está cerrado" } };
    }
    const [open] = await db.select({ n: count() }).from(tickets).where(unpaid);
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `Hay ${open?.n ?? 0} ticket(s) sin cobrar. Cóbralos o anúlalos antes de cerrar el día.`,
      },
    };
  }

  revalidatePath("/cashier");
  financialBreadcrumb("closeBusinessDay", { businessDayId: day.id });
  return { success: true, data: day };
}

// ---------------------------------------------------------------------------
// Reopen most recently closed business day
// ---------------------------------------------------------------------------

export async function reopenBusinessDay(rawInput: unknown): Promise<ActionResult<BusinessDay>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier", "admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = reopenBusinessDaySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Por favor corrige los errores en el formulario.",
        details: parsed.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    };
  }

  const db = getDb();

  // Can only reopen if no day is currently open
  const openDay = await db
    .select({ id: businessDays.id })
    .from(businessDays)
    .where(isNull(businessDays.closedAt))
    .limit(1);

  if (openDay.length > 0) {
    return {
      success: false,
      error: { code: "CONFLICT", message: "Cierra el día actual antes de reabrir uno anterior" },
    };
  }

  // Find the most recently closed day
  const lastClosed = await db
    .select()
    .from(businessDays)
    .where(isNotNull(businessDays.closedAt))
    .orderBy(desc(businessDays.closedAt))
    .limit(1);

  const target = lastClosed[0];
  if (!target) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "No hay días cerrados para reabrir" },
    };
  }

  const rows = await getTxDb().transaction(async (tx) => {
    const updated = await tx
      .update(businessDays)
      .set({
        closedAt: null,
        closedBy: null,
        reopenedBy: session.user.id,
        reopenedAt: new Date(),
        reopenReason: parsed.data.reason,
      })
      .where(and(eq(businessDays.id, target.id), isNotNull(businessDays.closedAt)))
      .returning();
    if (updated[0])
      await logActivity(tx, {
        actor: actorOf(session.user),
        action: "day.reopen",
        entityType: "business_day",
        entityId: target.id,
        businessDayId: target.id,
        reason: parsed.data.reason,
        before: { closedAt: target.closedAt, closedBy: target.closedBy },
      });
    return updated;
  });

  const day = rows[0];
  if (!day) {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Error al reabrir el día" },
    };
  }

  revalidatePath("/cashier");
  financialBreadcrumb("reopenBusinessDay", { businessDayId: day.id });
  return { success: true, data: day };
}
