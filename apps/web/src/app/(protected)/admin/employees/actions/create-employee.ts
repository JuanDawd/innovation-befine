"use server";

/**
 * Create employee server action — T013
 *
 * Creates a Better Auth user + employee record in one operation.
 * Only cashier_admin can call this.
 *
 * Password handling:
 * - If Resend (T054) is available: generate a random temporary password,
 *   send a "set your password" email, return success.
 * - If not yet wired (pre-T054): admin sets an explicit temporary password
 *   which is included in the form.
 * For now (pre-T054) we accept an explicit temporary password from the admin.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employees } from "@befine/db/schema";
import { createEmployeeSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";

export type CreatedEmployee = {
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  role: string;
};

export async function createEmployee(rawInput: unknown): Promise<ActionResult<CreatedEmployee>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier_admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = createEmployeeSchema.safeParse(rawInput);
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

  const { name, email, role, stylistSubtype, dailyRate, expectedWorkDays, temporaryPassword } =
    parsed.data;

  // Generate a random password if admin didn't provide one
  // (in pre-T054 flow, admin always provides one; in T054 flow, we'll generate one and email it)
  const password = temporaryPassword ?? crypto.randomUUID().replace(/-/g, "").slice(0, 12) + "Aa1!";

  // Create the auth user via Better Auth admin plugin
  const createUserResult = await auth.api.createUser({
    body: {
      name,
      email,
      password,
      role,
    },
    headers: await headers(),
  });

  if (!createUserResult || !createUserResult.user) {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "No se pudo crear el usuario" },
    };
  }

  const userId = createUserResult.user.id;

  // Insert employee record linked to the auth user
  const db = getDb();
  const employeeRows = await db
    .insert(employees)
    .values({
      userId,
      role,
      stylistSubtype: stylistSubtype ?? null,
      dailyRate: role === "secretary" ? (dailyRate ?? null) : null,
      expectedWorkDays: expectedWorkDays ?? 6,
      showEarnings: false,
      isActive: true,
    })
    .returning();

  const employee = employeeRows[0];
  if (!employee) {
    // Rollback: attempt to delete the created user to avoid orphan
    try {
      await auth.api.removeUser({ body: { userId }, headers: await headers() });
    } catch {
      // Best-effort cleanup; log if Sentry is available
    }
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "No se pudo crear el registro de empleado" },
    };
  }

  revalidatePath("/admin/employees");

  return {
    success: true,
    data: {
      userId,
      employeeId: employee.id,
      name,
      email,
      role,
    },
  };
}
