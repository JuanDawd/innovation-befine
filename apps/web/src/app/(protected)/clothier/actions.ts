"use server";

/**
 * Clothier batch actions — T046
 *
 * listTodayBatchPieces: clothier — returns their assigned + unassigned pieces for the current day.
 * claimPiece:           clothier — self-claim an unassigned piece (optimistic lock).
 * markPieceDone:        clothier — transition piece to done_pending_approval.
 */

import { headers } from "next/headers";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employees, users, clothBatches, batchPieces, clothPieces } from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/notifications";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { checkIdempotency, storeIdempotency } from "@/lib/idempotency";
import { pieceActionSchema } from "@befine/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BatchPieceRow = {
  id: string;
  batchId: string;
  clothPieceName: string;
  assignedToEmployeeId: string | null;
  claimSource: "assigned" | "self_claimed" | null;
  status: "pending" | "done_pending_approval" | "approved";
  version: number;
};

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getClothierEmployee(): Promise<{
  session: { user: { id: string } };
  employeeId: string;
  userId: string;
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "clothier")) return null;

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!emp) return null;
  return { session, employeeId: emp.id, userId: session.user.id };
}

// ─── List today's batch pieces for this clothier ──────────────────────────────

export async function listTodayBatchPieces(): Promise<ActionResult<BatchPieceRow[]>> {
  const ctx = await getClothierEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();

  // Pieces assigned to this clothier OR unassigned — from today's batches
  const rows = await db
    .select({
      id: batchPieces.id,
      batchId: batchPieces.batchId,
      clothPieceName: clothPieces.name,
      assignedToEmployeeId: batchPieces.assignedToEmployeeId,
      claimSource: batchPieces.claimSource,
      status: batchPieces.status,
      version: batchPieces.version,
    })
    .from(batchPieces)
    .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
    .innerJoin(clothPieces, eq(batchPieces.clothPieceId, clothPieces.id))
    .where(
      and(
        eq(clothBatches.businessDayId, businessDay.id),
        or(
          eq(batchPieces.assignedToEmployeeId, ctx.employeeId),
          isNull(batchPieces.assignedToEmployeeId),
        ),
      ),
    )
    .orderBy(batchPieces.status);

  return { success: true, data: rows };
}

// ─── Self-claim an unassigned piece ──────────────────────────────────────────

export async function claimPiece(
  rawPieceId: unknown,
  rawExpectedVersion: unknown,
): Promise<ActionResult<void>> {
  const parsed = pieceActionSchema.safeParse({
    pieceId: rawPieceId,
    expectedVersion: rawExpectedVersion,
  });
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const { pieceId, expectedVersion } = parsed.data;

  const ctx = await getClothierEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const rl = await checkRateLimit(rateLimits.general, ctx.userId);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

  const db = getDb();

  const result = await db
    .update(batchPieces)
    .set({
      assignedToEmployeeId: ctx.employeeId,
      claimSource: "self_claimed",
      claimedAt: new Date(),
      version: expectedVersion + 1,
    })
    .where(
      and(
        eq(batchPieces.id, pieceId),
        isNull(batchPieces.assignedToEmployeeId),
        eq(batchPieces.version, expectedVersion),
      ),
    )
    .returning({ id: batchPieces.id });

  if (result.length === 0)
    return {
      success: false,
      error: { code: "CONFLICT", message: "Esta pieza ya fue reclamada por otro confeccionista" },
    };

  revalidatePath("/clothier");
  return { success: true, data: undefined };
}

// ─── Mark piece as done (→ done_pending_approval) ────────────────────────────

export async function markPieceDone(
  rawPieceId: unknown,
  rawExpectedVersion: unknown,
  rawIdempotencyKey?: unknown,
): Promise<ActionResult<void>> {
  const parsed = pieceActionSchema.safeParse({
    pieceId: rawPieceId,
    expectedVersion: rawExpectedVersion,
    idempotencyKey: rawIdempotencyKey,
  });
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const { pieceId, expectedVersion, idempotencyKey } = parsed.data;

  const ctx = await getClothierEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  // T078: idempotency — return cached response on retry
  if (idempotencyKey) {
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) return cached as ActionResult<void>;
  }

  const rl = await checkRateLimit(rateLimits.general, ctx.userId);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

  const db = getDb();

  const result = await db
    .update(batchPieces)
    .set({
      status: "done_pending_approval",
      completedAt: new Date(),
      version: expectedVersion + 1,
    })
    .where(
      and(
        eq(batchPieces.id, pieceId),
        eq(batchPieces.assignedToEmployeeId, ctx.employeeId),
        eq(batchPieces.status, "pending"),
        eq(batchPieces.version, expectedVersion),
      ),
    )
    .returning({ id: batchPieces.id });

  if (result.length === 0)
    return {
      success: false,
      error: {
        code: "STALE_DATA",
        message: "El estado de esta pieza cambió. Recarga la página.",
      },
    };

  // Notify all active secretaries and admins
  const staffRows = await db
    .select({ id: employees.id })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(
      and(eq(employees.isActive, true), inArray(employees.role, ["secretary", "cashier_admin"])),
    );

  await Promise.all(
    staffRows.map((staff) =>
      createNotification({
        recipientEmployeeId: staff.id,
        type: "generic",
        message: "Una pieza de confección está lista para aprobar.",
        link: "/admin/batches",
      }),
    ),
  );

  revalidatePath("/clothier");
  const successResult: ActionResult<void> = { success: true, data: undefined };
  if (idempotencyKey) await storeIdempotency(idempotencyKey, "markPieceDone", successResult);
  return successResult;
}
