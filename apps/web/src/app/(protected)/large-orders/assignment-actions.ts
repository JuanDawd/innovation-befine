"use server";

import { headers } from "next/headers";
import { and, eq, sql, sum } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  orderItems,
  clothPieceAssignments,
  productionLogs,
  employees,
  users,
} from "@befine/db/schema";
import {
  createAssignmentSchema,
  updateCompletedQuantitySchema,
  approveAssignmentQuantitySchema,
} from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { getOrderItemsWithProgress, type OrderItemWithProgress } from "@befine/db";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireAdminOrSecretary() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, code: "UNAUTHORIZED" as const, session: null };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { ok: false as const, code: "FORBIDDEN" as const, session: null };
  return { ok: true as const, code: null, session };
}

async function requireAssignmentRole() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { ok: false as const, code: "UNAUTHORIZED" as const, session: null, employeeId: null };
  if (!hasRole(session.user, "cashier_admin", "secretary", "clothier"))
    return { ok: false as const, code: "FORBIDDEN" as const, session: null, employeeId: null };

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  return { ok: true as const, code: null, session, employeeId: emp?.id ?? null };
}

// ─── Task 4.7: createAssignment ───────────────────────────────────────────────

export async function createAssignment(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; unassignedQuantity: number }>> {
  const guard = await requireAdminOrSecretary();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const parsed = createAssignmentSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    };

  const { orderItemId, craftablePieceId, assigneeId, assignedQuantity } = parsed.data;

  const rl = await checkRateLimit(rateLimits.general, guard.session!.user.id);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

  const txDb = getTxDb();
  const db = getDb();

  // Validate assignee is active
  const [assignee] = await db
    .select({ id: employees.id, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, assigneeId))
    .limit(1);

  if (!assignee || !assignee.isActive)
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Empleado no encontrado o inactivo" },
    };

  type TxResult = { error: "NOT_FOUND" | "CONFLICT" } | { id: string; unassigned: number };

  const result: TxResult = await txDb.transaction(async (tx) => {
    const [item] = await tx
      .select({ quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.id, orderItemId));

    if (!item) return { error: "NOT_FOUND" as const };

    const [agg] = await tx
      .select({ total: sql<number>`COALESCE(${sum(clothPieceAssignments.assignedQuantity)}, 0)` })
      .from(clothPieceAssignments)
      .where(eq(clothPieceAssignments.orderItemId, orderItemId));

    const currentAssigned = Number(agg?.total ?? 0);

    if (currentAssigned + assignedQuantity > item.quantity) {
      Sentry.addBreadcrumb({
        message: "createAssignment CONFLICT",
        data: { orderItemId, currentAssigned, assignedQuantity, quantity: item.quantity },
      });
      return { error: "CONFLICT" as const };
    }

    const [inserted] = await tx
      .insert(clothPieceAssignments)
      .values({ orderItemId, craftablePieceId, assigneeId, assignedQuantity })
      .returning({ id: clothPieceAssignments.id });

    const unassigned = item.quantity - currentAssigned - assignedQuantity;
    return { id: inserted.id, unassigned };
  });

  if ("error" in result) {
    return {
      success: false,
      error: {
        code: result.error,
        message:
          result.error === "CONFLICT"
            ? "Capacidad insuficiente para esta asignación"
            : "Ítem no encontrado",
      },
    };
  }

  revalidatePath("/admin/large-orders");
  return { success: true, data: { id: result.id, unassignedQuantity: result.unassigned } };
}

// ─── Task 4.8: updateCompletedQuantity ───────────────────────────────────────

export async function updateCompletedQuantity(rawInput: unknown): Promise<ActionResult<null>> {
  const guard = await requireAssignmentRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const parsed = updateCompletedQuantitySchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const { assignmentId, completedQuantity, expectedVersion } = parsed.data;

  const rl = await checkRateLimit(rateLimits.general, guard.session!.user.id);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

  const db = getDb();
  const txDb = getTxDb();

  const [assignment] = await db
    .select({
      assignedQuantity: clothPieceAssignments.assignedQuantity,
      assigneeId: clothPieceAssignments.assigneeId,
      version: clothPieceAssignments.version,
    })
    .from(clothPieceAssignments)
    .where(eq(clothPieceAssignments.id, assignmentId))
    .limit(1);

  if (!assignment)
    return { success: false, error: { code: "NOT_FOUND", message: "Asignación no encontrada" } };

  // Clothier can only update their own assignment
  if (hasRole(guard.session!.user, "clothier") && assignment.assigneeId !== guard.employeeId)
    return {
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "No puedes modificar la asignación de otro confeccionista",
      },
    };

  if (completedQuantity > assignment.assignedQuantity)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `La cantidad completada (${completedQuantity}) no puede superar la asignada (${assignment.assignedQuantity})`,
      },
    };

  const now = new Date();
  const bogotaDate = toZonedTime(now, "America/Bogota");
  const loggedDate = format(bogotaDate, "yyyy-MM-dd");

  const txResult = await txDb.transaction(async (tx) => {
    const updated = await tx
      .update(clothPieceAssignments)
      .set({ completedQuantity, version: expectedVersion + 1, updatedAt: now })
      .where(
        and(
          eq(clothPieceAssignments.id, assignmentId),
          eq(clothPieceAssignments.version, expectedVersion),
        ),
      )
      .returning({ id: clothPieceAssignments.id });

    if (updated.length === 0) return false;

    if (guard.employeeId) {
      await tx.insert(productionLogs).values({
        assignmentId,
        quantity: completedQuantity > 0 ? completedQuantity : 1,
        loggedDate,
        loggedBy: guard.employeeId,
      });
    }

    return true;
  });

  if (!txResult)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El estado cambió. Recarga la página." },
    };

  revalidatePath("/admin/large-orders");
  return { success: true, data: null };
}

// ─── Task 4.9: approveAssignmentQuantity ─────────────────────────────────────

export async function approveAssignmentQuantity(rawInput: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdminOrSecretary();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const parsed = approveAssignmentQuantitySchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const { assignmentId, approvedQuantity, expectedVersion } = parsed.data;

  const rl = await checkRateLimit(rateLimits.general, guard.session!.user.id);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

  const db = getDb();

  const [assignment] = await db
    .select({ completedQuantity: clothPieceAssignments.completedQuantity })
    .from(clothPieceAssignments)
    .where(eq(clothPieceAssignments.id, assignmentId))
    .limit(1);

  if (!assignment)
    return { success: false, error: { code: "NOT_FOUND", message: "Asignación no encontrada" } };

  if (approvedQuantity > assignment.completedQuantity)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `La cantidad aprobada (${approvedQuantity}) no puede superar la completada (${assignment.completedQuantity})`,
      },
    };

  const updated = await db
    .update(clothPieceAssignments)
    .set({ approvedQuantity, version: expectedVersion + 1, updatedAt: new Date() })
    .where(
      and(
        eq(clothPieceAssignments.id, assignmentId),
        eq(clothPieceAssignments.version, expectedVersion),
      ),
    )
    .returning({ id: clothPieceAssignments.id });

  if (updated.length === 0)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El estado cambió. Recarga la página." },
    };

  revalidatePath("/admin/large-orders");
  return { success: true, data: null };
}

// ─── Task 4.11: getOrderItemsWithProgressData ─────────────────────────────────

export async function getOrderItemsWithProgressData(
  largeOrderId: string,
): Promise<ActionResult<OrderItemWithProgress[]>> {
  const guard = await requireAdminOrSecretary();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const data = await getOrderItemsWithProgress(db, largeOrderId);
  return { success: true, data };
}

// ─── Task 4.19: getCurrentUserProductionContext ──────────────────────────────

export type ProductionUserContext = {
  role: "cashier_admin" | "secretary" | "clothier" | "other";
  employeeId: string | null;
};

export async function getCurrentUserProductionContext(): Promise<ProductionUserContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { role: "other", employeeId: null };

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  const user = session.user as { role?: string };
  const role = (user.role ?? "") as ProductionUserContext["role"];
  const validRoles: ProductionUserContext["role"][] = ["cashier_admin", "secretary", "clothier"];
  return {
    role: validRoles.includes(role) ? role : "other",
    employeeId: emp?.id ?? null,
  };
}

// ─── Task 4.18: listActiveClothiers ──────────────────────────────────────────

export type ClothierOption = { id: string; name: string };

export async function listActiveClothiers(): Promise<ActionResult<ClothierOption[]>> {
  const guard = await requireAdminOrSecretary();
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
    .select({ id: employees.id, name: users.name })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(eq(employees.isActive, true), eq(employees.role, "clothier")))
    .orderBy(users.name);

  return { success: true, data: rows };
}
