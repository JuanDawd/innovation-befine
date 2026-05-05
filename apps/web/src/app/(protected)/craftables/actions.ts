"use server";

/**
 * Craftable server actions — T045
 *
 * listActiveClothiers: secretary/admin — for craftable assignment dropdowns.
 * createCraftable: secretary/admin — creates a craftable + pieces, sends notifications.
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { employees, users, craftables, craftablePieces } from "@befine/db/schema";
import { createCraftableSchema, type CreateCraftableInput } from "@befine/types";
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

export type CraftableRow = {
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

// ─── Create craftable ─────────────────────────────────────────────────────────

export async function createCraftable(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
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

  const parsed = createCraftableSchema.safeParse(rawInput);
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

  const input: CreateCraftableInput = parsed.data;

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

  const autoApproved = hasRole(session.user, "cashier_admin");

  // Create craftable + pieces atomically
  const txDb = getTxDb();
  const craftableId = await txDb.transaction(async (tx) => {
    const [craftable] = await tx
      .insert(craftables)
      .values({
        businessDayId: businessDay.id,
        createdBy: creatorEmployee.id,
        notes: input.notes ?? null,
        largeOrderId: input.largeOrderId ?? null,
        autoApproved,
      })
      .returning({ id: craftables.id });

    if (input.pieces.length > 0) {
      await tx.insert(craftablePieces).values(
        input.pieces.map((p) => ({
          craftableId: craftable.id,
          clothPieceId: p.clothPieceId,
          clothPieceVariantId: p.clothPieceVariantId,
          assignedToEmployeeId: p.assignedToEmployeeId ?? null,
          claimSource: p.assignedToEmployeeId ? ("assigned" as const) : null,
          claimedAt: p.assignedToEmployeeId ? new Date() : null,
          quantity: p.quantity ?? 1,
          color: p.color ?? null,
          style: p.style ?? null,
          size: p.size ?? null,
          instructions: p.instructions ?? null,
        })),
      );
    }

    return craftable.id;
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

  revalidatePath("/secretary/craftables");
  revalidatePath("/admin/craftables");

  return { success: true, data: { id: craftableId } };
}
