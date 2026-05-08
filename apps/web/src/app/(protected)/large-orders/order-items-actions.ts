"use server";

import { headers } from "next/headers";
import { eq, sql, sum } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { orderItems, clothPieceAssignments } from "@befine/db/schema";
import { addOrderItemSchema, editOrderItemSchema, removeOrderItemSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

async function requireAdminOrSecretary() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, code: "UNAUTHORIZED" as const, session: null };
  if (!hasRole(session.user, "admin", "secretary"))
    return { ok: false as const, code: "FORBIDDEN" as const, session: null };
  return { ok: true as const, code: null, session };
}

// ─── addOrderItem ─────────────────────────────────────────────────────────────

export async function addOrderItem(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdminOrSecretary();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const parsed = addOrderItemSchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

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
  const [inserted] = await db
    .insert(orderItems)
    .values({
      largeOrderId: parsed.data.largeOrderId,
      clothPieceId: parsed.data.clothPieceId,
      clothPieceVariantId: parsed.data.clothPieceVariantId,
      pieceName: parsed.data.pieceName,
      quantity: parsed.data.quantity,
      notes: parsed.data.notes ?? null,
    })
    .returning({ id: orderItems.id });

  revalidatePath("/admin/large-orders");
  return { success: true, data: { id: inserted.id } };
}

// ─── editOrderItem ────────────────────────────────────────────────────────────

export async function editOrderItem(rawInput: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdminOrSecretary();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const parsed = editOrderItemSchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const { itemId, quantity, notes } = parsed.data;

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

  // Validate new quantity >= current assigned sum
  const [agg] = await db
    .select({ total: sql<number>`COALESCE(${sum(clothPieceAssignments.assignedQuantity)}, 0)` })
    .from(clothPieceAssignments)
    .where(eq(clothPieceAssignments.orderItemId, itemId));

  const assignedSum = Number(agg?.total ?? 0);
  if (quantity < assignedSum)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `No se puede reducir la cantidad por debajo de la ya asignada (${assignedSum} unidades)`,
      },
    };

  await db
    .update(orderItems)
    .set({ quantity, notes: notes ?? null, updatedAt: new Date() })
    .where(eq(orderItems.id, itemId));

  revalidatePath("/admin/large-orders");
  return { success: true, data: null };
}

// ─── removeOrderItem ──────────────────────────────────────────────────────────

export async function removeOrderItem(rawInput: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdminOrSecretary();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const parsed = removeOrderItemSchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const { itemId } = parsed.data;

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

  const [agg] = await db
    .select({ total: sql<number>`COALESCE(${sum(clothPieceAssignments.assignedQuantity)}, 0)` })
    .from(clothPieceAssignments)
    .where(eq(clothPieceAssignments.orderItemId, itemId));

  const assignedSum = Number(agg?.total ?? 0);
  if (assignedSum > 0)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: "Hay unidades ya asignadas para esta pieza",
      },
    };

  await db
    .update(orderItems)
    .set({ quantity: 0, updatedAt: new Date() })
    .where(eq(orderItems.id, itemId));

  revalidatePath("/admin/large-orders");
  return { success: true, data: null };
}
