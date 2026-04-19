"use server";

/**
 * Cloth batch server actions — T045
 *
 * listActiveClothiers: secretary/admin — for batch assignment dropdowns.
 * createBatch: secretary/admin — creates a cloth_batch + batch_pieces, sends notifications.
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { employees, users, clothBatches, batchPieces } from "@befine/db/schema";
import { createBatchSchema, type CreateBatchInput } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/notifications";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClothierOption = {
  id: string;
  name: string;
};

export type BatchRow = {
  id: string;
  businessDayId: string;
  notes: string | null;
  createdAt: Date;
  pieceCount: number;
};

// ─── List active clothiers ─────────────────────────────────────────────────────

export async function listActiveClothiers(): Promise<ActionResult<ClothierOption[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const rows = await db
    .select({ id: employees.id, name: users.name })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(eq(employees.isActive, true), eq(employees.role, "clothier")))
    .orderBy(users.name);

  return { success: true, data: rows };
}

// ─── Create batch ─────────────────────────────────────────────────────────────

export async function createBatch(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const rl = await checkRateLimit(rateLimits.general, session.user.id);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

  const parsed = createBatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    };
  }

  const input: CreateBatchInput = parsed.data;

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay)
    return {
      success: false,
      error: { code: "CONFLICT", message: "No hay un día laboral abierto" },
    };

  // Resolve creator employee id
  const db = getDb();
  const [creatorEmployee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!creatorEmployee)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  // Create batch + pieces atomically
  const txDb = getTxDb();
  const batchId = await txDb.transaction(async (tx) => {
    const [batch] = await tx
      .insert(clothBatches)
      .values({
        businessDayId: businessDay.id,
        createdBy: creatorEmployee.id,
        notes: input.notes ?? null,
      })
      .returning({ id: clothBatches.id });

    if (input.pieces.length > 0) {
      await tx.insert(batchPieces).values(
        input.pieces.map((p) => ({
          batchId: batch.id,
          clothPieceId: p.clothPieceId,
          assignedToEmployeeId: p.assignedToEmployeeId ?? null,
          claimSource: p.assignedToEmployeeId ? ("assigned" as const) : null,
          claimedAt: p.assignedToEmployeeId ? new Date() : null,
        })),
      );
    }

    return batch.id;
  });

  // Notify each clothier who received an assignment (post-commit, deduplicated)
  const assignedClothierIds = [
    ...new Set(input.pieces.map((p) => p.assignedToEmployeeId).filter(Boolean) as string[]),
  ];

  await Promise.all(
    assignedClothierIds.map((clothierId) => {
      const assignedCount = input.pieces.filter(
        (p) => p.assignedToEmployeeId === clothierId,
      ).length;
      return createNotification({
        recipientEmployeeId: clothierId,
        type: "piece_assigned",
        message: `Tienes ${assignedCount} pieza${assignedCount !== 1 ? "s" : ""} asignada${assignedCount !== 1 ? "s" : ""} en el nuevo lote.`,
        link: "/clothier",
      });
    }),
  );

  revalidatePath("/secretary/batches");
  revalidatePath("/admin/batches");

  return { success: true, data: { id: batchId } };
}
