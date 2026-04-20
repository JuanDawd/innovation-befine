"use server";

/**
 * Update employee server action — T014 (edit), T015 (earnings flag), T022a (deactivate)
 *
 * All mutations require cashier_admin role.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, not, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { employees, users, payouts, businessDays } from "@befine/db/schema";
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

  const parsed = editEmployeeSchema.safeParse(rawInput);
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

  const { name, role, stylistSubtype, dailyRate, expectedWorkDays } = parsed.data;
  const db = getDb();

  // Update employee record
  const empRows = await db
    .update(employees)
    .set({
      role,
      stylistSubtype: stylistSubtype ?? null,
      dailyRate: role === "secretary" ? (dailyRate ?? null) : null,
      expectedWorkDays,
    })
    .where(eq(employees.id, employeeId))
    .returning();

  const emp = empRows[0];
  if (!emp) {
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  }

  // Update name in auth users table
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, emp.userId));

  // Update role in auth users table
  await auth.api.setRole({
    body: { userId: emp.userId, role },
    headers: await headers(),
  });

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

/** Returns unsettled periods for the given employee — used to block deactivation. */
export async function getUnsettledPeriodsForEmployee(
  employeeId: string,
): Promise<UnsettledPeriod | null> {
  const db = getDb();
  const existingPayouts = await db
    .select({ periodBusinessDayIds: payouts.periodBusinessDayIds })
    .from(payouts)
    .where(eq(payouts.employeeId, employeeId));

  const settledIds = new Set(existingPayouts.flatMap((p) => p.periodBusinessDayIds));

  const closedDays = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(not(sql`${businessDays.closedAt} IS NULL`));

  const unsettledDays = closedDays.filter((d) => !settledIds.has(d.id));
  if (!unsettledDays.length) return null;

  const dates = unsettledDays.map((d) => new Date(d.openedAt).toISOString().slice(0, 10)).sort();
  return { businessDayIds: unsettledDays.map((d) => d.id), oldestDate: dates[0] };
}

/**
 * T022b — Termination: record a final payout and deactivate immediately (atomic).
 * Block deactivation if unsettled earnings exist but no termination amount is given.
 */
export async function terminateEmployee(
  employeeId: string,
  terminationAmount: number,
  method: "cash" | "card" | "transfer",
  reason: string,
): Promise<ActionResult<{ deactivatedAt: Date }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  if (terminationAmount < 0)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "El monto de liquidación no puede ser negativo" },
    };
  if (!reason.trim())
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Se requiere motivo de liquidación" },
    };

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
    // Record termination payout covering all unsettled days
    if (unsettled) {
      await tx.insert(payouts).values({
        employeeId,
        amount: terminationAmount,
        originalComputedAmount: terminationAmount,
        adjustmentReason: reason,
        method,
        periodBusinessDayIds: unsettled.businessDayIds,
        recordedBy: adminEmp.id,
        notes: "Liquidación final",
      });
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
