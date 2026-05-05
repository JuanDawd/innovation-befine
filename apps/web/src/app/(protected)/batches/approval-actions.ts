"use server";

/**
 * Batch piece approval actions — T047
 *
 * listPendingApprovals: secretary/admin — pieces in done_pending_approval state.
 * approvePiece:         secretary/admin — transition piece to approved.
 * adminMarkApproved:    admin only — mark a piece approved directly (skipping clothier step).
 */

import { headers } from "next/headers";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  employees,
  users,
  craftables,
  craftablePieces,
  clothPieces,
  clothPieceVariants,
} from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { pieceActionSchema } from "@befine/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingApprovalRow = {
  id: string;
  craftableId: string;
  clothPieceName: string;
  clothPieceVariantName: string;
  assignedToEmployeeId: string | null;
  assignedEmployeeName: string | null;
  claimSource: "assigned" | "self_claimed" | null;
  status: "pending" | "done_pending_approval" | "approved";
  completedAt: Date | null;
  version: number;
};

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getStaffEmployee(): Promise<{ employeeId: string; userId: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin", "secretary")) return null;

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  return emp ? { employeeId: emp.id, userId: session.user.id } : null;
}

// ─── List pending approvals ───────────────────────────────────────────────────

export async function listPendingApprovals(): Promise<ActionResult<PendingApprovalRow[]>> {
  const ctx = await getStaffEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();

  const rows = await db
    .select({
      id: craftablePieces.id,
      craftableId: craftablePieces.craftableId,
      clothPieceName: clothPieces.name,
      clothPieceVariantName: clothPieceVariants.name,
      assignedToEmployeeId: craftablePieces.assignedToEmployeeId,
      assignedEmployeeName: users.name,
      claimSource: craftablePieces.claimSource,
      status: craftablePieces.status,
      completedAt: craftablePieces.completedAt,
      version: craftablePieces.version,
    })
    .from(craftablePieces)
    .innerJoin(craftables, eq(craftablePieces.craftableId, craftables.id))
    .innerJoin(clothPieces, eq(craftablePieces.clothPieceId, clothPieces.id))
    .innerJoin(clothPieceVariants, eq(craftablePieces.clothPieceVariantId, clothPieceVariants.id))
    .leftJoin(employees, eq(craftablePieces.assignedToEmployeeId, employees.id))
    .leftJoin(users, eq(employees.userId, users.id))
    .where(
      and(
        eq(craftables.businessDayId, businessDay.id),
        inArray(craftablePieces.status, ["done_pending_approval", "pending"]),
      ),
    )
    .orderBy(craftablePieces.status, craftablePieces.completedAt);

  return { success: true, data: rows };
}

// ─── Approve a piece (done_pending_approval → approved) ──────────────────────

export async function approvePiece(
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

  const ctx = await getStaffEmployee();
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
    .update(craftablePieces)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy: ctx.employeeId,
      version: expectedVersion + 1,
    })
    .where(
      and(
        eq(craftablePieces.id, pieceId),
        eq(craftablePieces.status, "done_pending_approval"),
        eq(craftablePieces.version, expectedVersion),
      ),
    )
    .returning({ id: craftablePieces.id });

  if (result.length === 0)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El estado cambió. Recarga la página." },
    };

  revalidatePath("/admin/batches");
  revalidatePath("/secretary/batches");
  return { success: true, data: undefined };
}

// ─── Admin: directly approve a pending piece (skip clothier step) ─────────────

export async function adminMarkApproved(
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

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
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

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  const result = await db
    .update(craftablePieces)
    .set({
      status: "approved",
      completedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: emp.id,
      version: expectedVersion + 1,
    })
    .where(
      and(
        eq(craftablePieces.id, pieceId),
        eq(craftablePieces.status, "pending"),
        eq(craftablePieces.version, expectedVersion),
      ),
    )
    .returning({ id: craftablePieces.id });

  if (result.length === 0)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El estado cambió. Recarga la página." },
    };

  revalidatePath("/admin/batches");
  revalidatePath("/secretary/batches");
  return { success: true, data: undefined };
}
