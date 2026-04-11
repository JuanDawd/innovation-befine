"use server";

/**
 * Cloth piece catalog server actions — T027, T028
 *
 * CRUD for cloth_pieces.
 * Only cashier_admin can mutate; secretary can read (T028).
 * Every mutation writes to catalog_audit_log.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { clothPieces, catalogAuditLog } from "@befine/db/schema";
import { createClothPieceSchema, editClothPieceSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ClothPieceRow = {
  id: string;
  name: string;
  description: string | null;
  pieceRate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (session.user.role !== "cashier_admin") return null;
  return session;
}

function writeAuditLog(
  db: ReturnType<typeof getDb>,
  params: {
    entityId: string;
    action: "create" | "update" | "soft_delete" | "restore";
    changedBy: string;
    previousData?: unknown;
    newData?: unknown;
  },
) {
  return db.insert(catalogAuditLog).values({
    entityType: "cloth_piece",
    entityId: params.entityId,
    action: params.action,
    changedBy: params.changedBy,
    previousData: params.previousData ?? null,
    newData: params.newData ?? null,
  });
}

// ─── Read actions (T028) ─────────────────────────────────────────────────────

/**
 * List all active cloth pieces.
 * Available to cashier_admin and secretary.
 */
export async function listActiveClothPieces(): Promise<ActionResult<ClothPieceRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const ALLOWED_ROLES = ["cashier_admin", "secretary"];
  if (!ALLOWED_ROLES.includes(session.user.role ?? "")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const rows = await db.query.clothPieces.findMany({
    where: eq(clothPieces.isActive, true),
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  return { success: true, data: rows };
}

/**
 * List ALL cloth pieces including inactive ones (admin-only).
 */
export async function listAllClothPieces(): Promise<ActionResult<ClothPieceRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (session.user.role !== "cashier_admin") {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const rows = await db.query.clothPieces.findMany({
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  return { success: true, data: rows };
}

// ─── Create cloth piece ──────────────────────────────────────────────────────

export async function createClothPiece(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = createClothPieceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const db = getDb();
  const [piece] = await db
    .insert(clothPieces)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      pieceRate: parsed.data.pieceRate,
    })
    .returning({ id: clothPieces.id });

  await writeAuditLog(db, {
    entityId: piece.id,
    action: "create",
    changedBy: session.user.id,
    newData: parsed.data,
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: { id: piece.id } };
}

// ─── Edit cloth piece ────────────────────────────────────────────────────────

export async function editClothPiece(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = editClothPieceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const db = getDb();
  const existing = await db.query.clothPieces.findFirst({ where: eq(clothPieces.id, id) });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Pieza no encontrada" } };

  await db
    .update(clothPieces)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      pieceRate: parsed.data.pieceRate,
      updatedAt: new Date(),
    })
    .where(eq(clothPieces.id, id));

  await writeAuditLog(db, {
    entityId: id,
    action: "update",
    changedBy: session.user.id,
    previousData: {
      name: existing.name,
      description: existing.description,
      pieceRate: existing.pieceRate,
    },
    newData: parsed.data,
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: { id } };
}

// ─── Soft-delete cloth piece ─────────────────────────────────────────────────

export async function deactivateClothPiece(id: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const existing = await db.query.clothPieces.findFirst({ where: eq(clothPieces.id, id) });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Pieza no encontrada" } };

  await db
    .update(clothPieces)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(clothPieces.id, id));

  await writeAuditLog(db, {
    entityId: id,
    action: "soft_delete",
    changedBy: session.user.id,
    previousData: { isActive: true },
    newData: { isActive: false },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

// ─── Restore cloth piece ─────────────────────────────────────────────────────

export async function restoreClothPiece(id: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  await db
    .update(clothPieces)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(clothPieces.id, id));

  await writeAuditLog(db, {
    entityId: id,
    action: "restore",
    changedBy: session.user.id,
    newData: { isActive: true },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}
