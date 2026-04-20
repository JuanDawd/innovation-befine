"use server";

/**
 * List employees server action — T014
 *
 * Returns all employees with their user data (name, email, role).
 * Only cashier_admin can call this.
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employees, users } from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";

export type EmployeeListItem = {
  id: string; // employee record id
  userId: string;
  name: string;
  email: string;
  role: string;
  stylistSubtype: string | null;
  dailyRate: number | null;
  expectedWorkDays: number;
  showEarnings: boolean;
  isActive: boolean;
  version: number;
  hiredAt: Date;
  deactivatedAt: Date | null;
};

export async function listEmployees(): Promise<ActionResult<EmployeeListItem[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }
  if (!hasRole(session.user, "cashier_admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
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
    .orderBy(employees.hiredAt);

  return { success: true, data: rows };
}
