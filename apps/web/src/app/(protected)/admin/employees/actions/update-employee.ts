"use server";

/**
 * Update employee server action — T014 (edit), T015 (earnings flag), T022a (deactivate)
 *
 * All mutations require cashier_admin role.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, not, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  employees,
  users,
  payouts,
  payoutPeriodDays,
  businessDays,
  tickets,
  batchPieces,
  clothBatches,
  employeeAbsences,
} from "@befine/db/schema";
import { terminateEmployeeSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import type { EmployeeListItem } from "./list-employees";
import { hasRole } from "@/lib/middleware-helpers";

// ---------------------------------------------------------------------------
// Edit employee (name, role, subtype, daily rate) — T014
// ---------------------------------------------------------------------------

const editEmployeeSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum(["cashier_admin", "secretary", "stylist", "clothier"]),
  stylistSubtype: z
    .enum(["hairdresser", "manicurist", "masseuse", "makeup_artist", "spa_manager"])
    .nullable()
    .optional(),
  dailyRate: z.coerce.number().int().min(0).nullable().optional(),
  expectedWorkDays: z.coerce.number().int().min(1).max(7).default(6),
});

const editEmployeeSchemaWithVersion = editEmployeeSchema.extend({
  version: z.number().int().min(0),
});

export async function editEmployee(
  employeeId: string,
  rawInput: unknown,
): Promise<ActionResult<EmployeeListItem>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier_admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = editEmployeeSchemaWithVersion.safeParse(rawInput);
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

  const { name, role, stylistSubtype, dailyRate, expectedWorkDays, version } = parsed.data;
  const db = getDb();

  // Optimistic locking: only update if version matches; increment version
  const empRows = await db
    .update(employees)
    .set({
      role,
      stylistSubtype: stylistSubtype ?? null,
      dailyRate: role === "secretary" ? (dailyRate ?? null) : null,
      expectedWorkDays,
      version: sql<number>`${employees.version} + 1`,
    })
    .where(and(eq(employees.id, employeeId), eq(employees.version, version)))
    .returning();

  const emp = empRows[0];
  if (!emp) {
    // Either not found or stale version
    const [existing] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    return existing
      ? {
          success: false,
          error: {
            code: "STALE_DATA",
            message: "Otro usuario modificó este empleado. Recarga y reintenta.",
          },
        }
      : { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  }

  // Update name in auth users table
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, emp.userId));

  // Update role in auth system — capture prior role for rollback if needed
  const [priorUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, emp.userId))
    .limit(1);

  try {
    await auth.api.setRole({
      body: { userId: emp.userId, role },
      headers: await headers(),
    });
  } catch (authErr) {
    // Roll back employee role/name changes to prior state
    await db
      .update(employees)
      .set({ role: priorUser?.role ?? emp.role, version: sql<number>`${employees.version} - 1` })
      .where(eq(employees.id, employeeId));
    await db
      .update(users)
      .set({ role: priorUser?.role ?? emp.role })
      .where(eq(users.id, emp.userId));
    throw authErr;
  }

  // Re-fetch with user data to return full item
  const rows = await db
    .select({
      id: employees.id,
      userId: employees.userId,
      name: users.name,
      email: users.email,
      role: employees.role,
      stylistSubtype: employees.stylistSubtype,
      dailyRate: employees.dailyRate,
      expectedWorkDays: employees.expectedWorkDays,
      showEarnings: employees.showEarnings,
      isActive: employees.isActive,
      version: employees.version,
      hiredAt: employees.hiredAt,
      deactivatedAt: employees.deactivatedAt,
    })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  const updated = rows[0];
  if (!updated) {
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  }

  revalidatePath("/admin/employees");
  return { success: true, data: updated };
}

// ---------------------------------------------------------------------------
// Toggle earnings visibility — T015
// ---------------------------------------------------------------------------

export async function setShowEarnings(
  employeeId: string,
  showEarnings: boolean,
): Promise<ActionResult<{ showEarnings: boolean }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier_admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const rows = await db
    .update(employees)
    .set({ showEarnings })
    .where(eq(employees.id, employeeId))
    .returning({ showEarnings: employees.showEarnings });

  const row = rows[0];
  if (!row) {
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  }

  revalidatePath("/admin/employees");
  return { success: true, data: { showEarnings: row.showEarnings } };
}

// ---------------------------------------------------------------------------
// Deactivate employee — T022a
// ---------------------------------------------------------------------------

export async function deactivateEmployee(
  employeeId: string,
): Promise<ActionResult<{ deactivatedAt: Date }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier_admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  // T022b: block deactivation if employee has unsettled earnings
  const unsettled = await getUnsettledPeriodsForEmployee(employeeId);
  if (unsettled) {
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `El empleado tiene ganancias sin liquidar desde ${unsettled.oldestDate}. Usa la opción de liquidación final (terminateEmployee) o liquida los pagos antes de desactivar.`,
      },
    };
  }

  const db = getDb();
  const now = new Date();

  const empRows = await db
    .update(employees)
    .set({ isActive: false, deactivatedAt: now })
    .where(and(eq(employees.id, employeeId), eq(employees.isActive, true)))
    .returning({ userId: employees.userId, deactivatedAt: employees.deactivatedAt });

  const emp = empRows[0];
  if (!emp || !emp.deactivatedAt) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Empleado no encontrado o ya inactivo" },
    };
  }

  // Ban the user in Better Auth so future login attempts are rejected (T01R-R1)
  await auth.api.banUser({
    body: { userId: emp.userId, banReason: "Employee deactivated" },
    headers: await headers(),
  });

  // Invalidate all active sessions for the deactivated user (T022a AC: session invalidated)
  await auth.api.revokeUserSessions({
    body: { userId: emp.userId },
    headers: await headers(),
  });

  revalidatePath("/admin/employees");
  return { success: true, data: { deactivatedAt: emp.deactivatedAt } };
}

// ---------------------------------------------------------------------------
// checkUnsettledEarnings + terminateEmployee — T022b
// ---------------------------------------------------------------------------

export type UnsettledPeriod = { businessDayIds: string[]; oldestDate: string };

/** Returns unsettled periods for the given employee — used to block deactivation.
 *  Role-aware: only counts days the employee actually worked (T07R-R3). */
export async function getUnsettledPeriodsForEmployee(
  employeeId: string,
): Promise<UnsettledPeriod | null> {
  const db = getDb();

  const [emp] = await db
    .select({ role: employees.role })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) return null;

  // Settled days for this employee from junction table
  const settledRows = await db
    .select({ businessDayId: payoutPeriodDays.businessDayId })
    .from(payoutPeriodDays)
    .where(eq(payoutPeriodDays.employeeId, employeeId));
  const settledIds = new Set(settledRows.map((r) => r.businessDayId));

  const closedDays = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(not(sql`${businessDays.closedAt} IS NULL`));

  if (!closedDays.length) return null;
  const closedDayIds = closedDays.map((d) => d.id);

  let unsettledDays: typeof closedDays = [];

  if (emp.role === "stylist") {
    const workDays = await db
      .selectDistinct({ businessDayId: tickets.businessDayId })
      .from(tickets)
      .where(
        and(
          eq(tickets.employeeId, employeeId),
          eq(tickets.status, "closed"),
          inArray(tickets.businessDayId, closedDayIds),
        ),
      );
    unsettledDays = closedDays.filter(
      (d) => workDays.some((w) => w.businessDayId === d.id) && !settledIds.has(d.id),
    );
  } else if (emp.role === "clothier") {
    const workDays = await db
      .selectDistinct({ businessDayId: clothBatches.businessDayId })
      .from(batchPieces)
      .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
      .where(
        and(
          eq(batchPieces.assignedToEmployeeId, employeeId),
          eq(batchPieces.status, "approved"),
          inArray(clothBatches.businessDayId, closedDayIds),
        ),
      );
    unsettledDays = closedDays.filter(
      (d) => workDays.some((w) => w.businessDayId === d.id) && !settledIds.has(d.id),
    );
  } else {
    // Secretary: closed days not settled, excluding vacation + approved_absence
    const dateStrings = closedDays.map((d) => new Date(d.openedAt).toISOString().slice(0, 10));
    const absences = await db
      .select({ date: employeeAbsences.date })
      .from(employeeAbsences)
      .where(
        and(
          eq(employeeAbsences.employeeId, employeeId),
          inArray(employeeAbsences.date, dateStrings),
          sql`${employeeAbsences.type} IN ('vacation', 'approved_absence')`,
        ),
      );
    const excludedDates = new Set(absences.map((a) => a.date));
    unsettledDays = closedDays.filter((d) => {
      const dateStr = new Date(d.openedAt).toISOString().slice(0, 10);
      return !settledIds.has(d.id) && !excludedDates.has(dateStr);
    });
  }

  if (!unsettledDays.length) return null;
  const dates = unsettledDays.map((d) => new Date(d.openedAt).toISOString().slice(0, 10)).sort();
  return { businessDayIds: unsettledDays.map((d) => d.id), oldestDate: dates[0] };
}

/**
 * T022b — Termination: record a final payout and deactivate immediately (atomic).
 * Block deactivation if unsettled earnings exist but no termination amount is given.
 */
export async function terminateEmployee(
  rawInput: unknown,
): Promise<ActionResult<{ deactivatedAt: Date }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const parsed = terminateEmployeeSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const { employeeId, terminationAmount, method, reason } = parsed.data;

  const db = getDb();
  const [adminEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);
  if (!adminEmp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  const unsettled = await getUnsettledPeriodsForEmployee(employeeId);
  const txDb = getTxDb();
  const now = new Date();

  const deactivatedAt = await txDb.transaction(async (tx) => {
    // Record termination payout covering all unsettled days (T07R-R1: junction table)
    if (unsettled && unsettled.businessDayIds.length > 0) {
      const idemKey = crypto.randomUUID();
      const [payout] = await tx
        .insert(payouts)
        .values({
          idempotencyKey: idemKey,
          employeeId,
          amount: terminationAmount,
          originalComputedAmount: terminationAmount,
          adjustmentReason: reason,
          method,
          recordedBy: adminEmp.id,
          notes: "Liquidación final",
        })
        .returning({ id: payouts.id });

      await tx.insert(payoutPeriodDays).values(
        unsettled.businessDayIds.map((dayId) => ({
          payoutId: payout.id,
          employeeId,
          businessDayId: dayId,
        })),
      );
    }

    const [emp] = await tx
      .update(employees)
      .set({ isActive: false, deactivatedAt: now })
      .where(and(eq(employees.id, employeeId), eq(employees.isActive, true)))
      .returning({ userId: employees.userId, deactivatedAt: employees.deactivatedAt });

    if (!emp?.deactivatedAt) throw new Error("NOT_FOUND");
    return { userId: emp.userId, deactivatedAt: emp.deactivatedAt };
  });

  await auth.api.banUser({
    body: { userId: deactivatedAt.userId, banReason: "Employee terminated" },
    headers: await headers(),
  });
  await auth.api.revokeUserSessions({
    body: { userId: deactivatedAt.userId },
    headers: await headers(),
  });

  revalidatePath("/admin/employees");
  revalidatePath("/admin/payroll");
  return { success: true, data: { deactivatedAt: deactivatedAt.deactivatedAt } };
}

// ---------------------------------------------------------------------------
// canSeeOwnEarnings helper — T015
// ---------------------------------------------------------------------------

/**
 * Returns whether an employee is allowed to view their own earnings.
 * Use this in Phase 7 earnings screens to gate access.
 */
export async function canSeeOwnEarnings(employeeId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ showEarnings: employees.showEarnings })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  return rows[0]?.showEarnings ?? false;
}
