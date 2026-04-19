"use server";

/**
 * Absence management server actions — T021
 *
 * logAbsence:         admin — create or upsert an absence record
 * deleteAbsence:      admin — remove an absence record
 * listAbsencesForMonth: admin — fetch all absences for a given month
 * listActiveEmployees:  admin — for the absence UI employee selector
 */

import { headers } from "next/headers";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employees, users, employeeAbsences } from "@befine/db/schema";
import { logAbsenceSchema, deleteAbsenceSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AbsenceRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  type: "vacation" | "approved_absence" | "missed";
  date: string;
  note: string | null;
};

export type EmployeeOption = {
  id: string;
  name: string;
  role: string;
};

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, code: "UNAUTHORIZED" as const, userId: null };
  if (!hasRole(session.user, "cashier_admin"))
    return { ok: false as const, code: "FORBIDDEN" as const, userId: null };
  return { ok: true as const, code: null, userId: session.user.id };
}

// ─── Log absence (T021) ──────────────────────────────────────────────────────

export async function logAbsence(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
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
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = logAbsenceSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
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

  // Upsert — if same employee+date exists, update type/note
  const [absence] = await db
    .insert(employeeAbsences)
    .values({
      employeeId: parsed.data.employeeId,
      type: parsed.data.type,
      date: parsed.data.date,
      note: parsed.data.note ?? null,
      createdBy: adminEmp.id,
    })
    .onConflictDoUpdate({
      target: [employeeAbsences.employeeId, employeeAbsences.date],
      set: {
        type: sql`excluded.type`,
        note: sql`excluded.note`,
      },
    })
    .returning({ id: employeeAbsences.id });

  revalidatePath("/admin/absences");
  return { success: true, data: { id: absence.id } };
}

// ─── Delete absence (T021) ───────────────────────────────────────────────────

export async function deleteAbsence(rawInput: unknown): Promise<ActionResult<null>> {
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
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = deleteAbsenceSchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const db = getDb();
  const result = await db
    .delete(employeeAbsences)
    .where(eq(employeeAbsences.id, parsed.data.absenceId))
    .returning({ id: employeeAbsences.id });

  if (!result.length)
    return { success: false, error: { code: "NOT_FOUND", message: "Ausencia no encontrada" } };

  revalidatePath("/admin/absences");
  return { success: true, data: null };
}

// ─── List absences for month (T021) ─────────────────────────────────────────

export async function listAbsencesForMonth(
  year: number,
  month: number,
): Promise<ActionResult<AbsenceRow[]>> {
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
  // month is 1-based
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const rows = await db
    .select({
      id: employeeAbsences.id,
      employeeId: employeeAbsences.employeeId,
      employeeName: users.name,
      type: employeeAbsences.type,
      date: employeeAbsences.date,
      note: employeeAbsences.note,
    })
    .from(employeeAbsences)
    .innerJoin(employees, eq(employeeAbsences.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(gte(employeeAbsences.date, from), lte(employeeAbsences.date, to)))
    .orderBy(employeeAbsences.date, users.name);

  return { success: true, data: rows };
}

// ─── List active employees (for selector) ────────────────────────────────────

export async function listActiveEmployeesForAbsence(): Promise<ActionResult<EmployeeOption[]>> {
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
    .select({ id: employees.id, name: users.name, role: employees.role })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.isActive, true))
    .orderBy(users.name);

  return { success: true, data: rows };
}
