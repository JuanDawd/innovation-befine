"use server";

/**
 * Cloth piece catalog server actions — T027, T028
 *
 * cloth_pieces: garment family (name/description, no price).
 * cloth_piece_variants: construction types with piece_rate.
 *
 * Only admin can mutate; secretary can read (T028).
 * Every mutation writes to activity_log in the same transaction (T114).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { clothPieces, clothPieceVariants } from "@befine/db/schema";
import { createClothPieceSchema, editClothPieceSchema } from "@befine/types";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ClothPieceVariantRow = {
  id: string;
  clothPieceId: string;
  name: string;
  pieceRate: number;
  sellingPrice: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ClothPieceRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  variants: ClothPieceVariantRow[];
};

// ─── Variant schemas ──────────────────────────────────────────────────────────

const createVariantSchema = z.object({
  name: z.string().min(1).max(100),
  pieceRate: z.number().int().min(0, "La tarifa no puede ser negativa"),
  sellingPrice: z
    .number()
    .int()
    .min(0, "El precio de venta no puede ser negativo")
    .nullable()
    .optional(),
});

const editVariantSchema = createVariantSchema;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (!hasRole(session.user, "admin")) return null;
  return session;
}

const CATALOG_ACTION = {
  create: "catalog.create",
  update: "catalog.update",
  soft_delete: "catalog.deactivate",
  restore: "catalog.restore",
} as const;

function writeAuditLog(
  tx: ActivityTx,
  params: {
    entityType?: "cloth_piece" | "cloth_piece_variant";
    entityId: string;
    action: keyof typeof CATALOG_ACTION;
    actor: { id: string; role?: string | null };
    name: string;
    previousData?: unknown;
    newData?: unknown;
  },
) {
  return logActivity(tx, {
    actor: actorOf(params.actor),
    action: CATALOG_ACTION[params.action],
    entityType: params.entityType ?? "cloth_piece",
    entityId: params.entityId,
    data: { name: params.name },
    before: params.previousData,
    after: params.newData,
  });
}

// ─── Read actions (T028) ──────────────────────────────────────────────────────

export async function listActiveClothPieces(): Promise<ActionResult<ClothPieceRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  // M-04: cashier opens large orders too (SHARED_APP_PATHS) and needs the piece
  // list there. Clothiers get piece names through their own board instead.
  if (!hasRole(session.user, "admin", "cashier", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const pieces = await db.query.clothPieces.findMany({
    where: eq(clothPieces.isActive, true),
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  const result = await Promise.all(
    pieces.map(async (p) => {
      const variants = await db.query.clothPieceVariants.findMany({
        where: eq(clothPieceVariants.clothPieceId, p.id),
        orderBy: (v, { asc }) => [asc(v.createdAt)],
      });
      return { ...p, variants };
    }),
  );

  return { success: true, data: result };
}

export async function listAllClothPieces(): Promise<ActionResult<ClothPieceRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const pieces = await db.query.clothPieces.findMany({
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  const result = await Promise.all(
    pieces.map(async (p) => {
      const variants = await db.query.clothPieceVariants.findMany({
        where: eq(clothPieceVariants.clothPieceId, p.id),
        orderBy: (v, { asc }) => [asc(v.createdAt)],
      });
      return { ...p, variants };
    }),
  );

  return { success: true, data: result };
}

// ─── Create cloth piece ───────────────────────────────────────────────────────

export async function createClothPiece(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = createClothPieceSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const piece = await getTxDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(clothPieces)
      .values({ name: parsed.data.name, description: parsed.data.description ?? null })
      .returning({ id: clothPieces.id });

    await writeAuditLog(tx, {
      entityId: created.id,
      action: "create",
      actor: session.user,
      name: parsed.data.name,
      newData: parsed.data,
    });
    return created;
  });
  revalidatePath("/admin/catalog");
  return { success: true, data: { id: piece.id } };
}

// ─── Edit cloth piece ─────────────────────────────────────────────────────────

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
  const existing = await db.query.clothPieces.findFirst({ where: eq(clothPieces.id, id) });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Pieza no encontrada" } };

  await getTxDb().transaction(async (tx) => {
    await tx
      .update(clothPieces)
      .set({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(clothPieces.id, id));
    await writeAuditLog(tx, {
      entityId: id,
      action: "update",
      actor: session.user,
      name: parsed.data.name,
      previousData: { name: existing.name, description: existing.description },
      newData: parsed.data,
    });
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: { id } };
}

// ─── Soft-delete / restore cloth piece ───────────────────────────────────────

export async function deactivateClothPiece(id: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }
  const found = await getTxDb().transaction(async (tx) => {
    const [row] = await tx
      .update(clothPieces)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(clothPieces.id, id))
      .returning({ name: clothPieces.name });
    if (!row) return false;
    await writeAuditLog(tx, {
      entityId: id,
      action: "soft_delete",
      actor: session.user,
      name: row.name,
      previousData: { isActive: true },
      newData: { isActive: false },
    });
    return true;
  });
  if (!found)
    return { success: false, error: { code: "NOT_FOUND", message: "Pieza no encontrada" } };
  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

export async function restoreClothPiece(id: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }
  const found = await getTxDb().transaction(async (tx) => {
    const [row] = await tx
      .update(clothPieces)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(clothPieces.id, id))
      .returning({ name: clothPieces.name });
    if (!row) return false;
    await writeAuditLog(tx, {
      entityId: id,
      action: "restore",
      actor: session.user,
      name: row.name,
      previousData: { isActive: false },
      newData: { isActive: true },
    });
    return true;
  });
  if (!found)
    return { success: false, error: { code: "NOT_FOUND", message: "Pieza no encontrada" } };
  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

// ─── Variant CRUD ─────────────────────────────────────────────────────────────

export async function createClothPieceVariant(
  clothPieceId: string,
  rawInput: unknown,
): Promise<ActionResult<ClothPieceVariantRow>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = createVariantSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const variant = await getTxDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(clothPieceVariants)
      .values({
        clothPieceId,
        name: parsed.data.name,
        pieceRate: parsed.data.pieceRate,
        sellingPrice: parsed.data.sellingPrice ?? null,
      })
      .returning();
    await writeAuditLog(tx, {
      entityType: "cloth_piece_variant",
      entityId: created.id,
      action: "create",
      actor: session.user,
      name: created.name,
      newData: parsed.data,
    });
    return created;
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: variant };
}

export async function editClothPieceVariant(
  variantId: string,
  rawInput: unknown,
): Promise<ActionResult<ClothPieceVariantRow>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = editVariantSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const updated = await getTxDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({
        name: clothPieceVariants.name,
        pieceRate: clothPieceVariants.pieceRate,
        sellingPrice: clothPieceVariants.sellingPrice,
      })
      .from(clothPieceVariants)
      .where(eq(clothPieceVariants.id, variantId))
      .for("update");
    if (!existing) return null;
    const [row] = await tx
      .update(clothPieceVariants)
      .set({
        name: parsed.data.name,
        pieceRate: parsed.data.pieceRate,
        sellingPrice: parsed.data.sellingPrice ?? null,
        updatedAt: new Date(),
      })
      .where(eq(clothPieceVariants.id, variantId))
      .returning();
    await writeAuditLog(tx, {
      entityType: "cloth_piece_variant",
      entityId: variantId,
      action: "update",
      actor: session.user,
      name: row.name,
      previousData: existing,
      newData: parsed.data,
    });
    return row;
  });

  if (!updated)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };

  revalidatePath("/admin/catalog");
  return { success: true, data: updated };
}

export async function deactivateClothPieceVariant(variantId: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }
  const found = await getTxDb().transaction(async (tx) => {
    const [row] = await tx
      .update(clothPieceVariants)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(clothPieceVariants.id, variantId))
      .returning({ name: clothPieceVariants.name });
    if (!row) return false;
    await writeAuditLog(tx, {
      entityType: "cloth_piece_variant",
      entityId: variantId,
      action: "soft_delete",
      actor: session.user,
      name: row.name,
      previousData: { isActive: true },
      newData: { isActive: false },
    });
    return true;
  });
  if (!found)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };
  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

export async function restoreClothPieceVariant(variantId: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }
  const found = await getTxDb().transaction(async (tx) => {
    const [row] = await tx
      .update(clothPieceVariants)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(clothPieceVariants.id, variantId))
      .returning({ name: clothPieceVariants.name });
    if (!row) return false;
    await writeAuditLog(tx, {
      entityType: "cloth_piece_variant",
      entityId: variantId,
      action: "restore",
      actor: session.user,
      name: row.name,
      previousData: { isActive: false },
      newData: { isActive: true },
    });
    return true;
  });
  if (!found)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };
  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}
