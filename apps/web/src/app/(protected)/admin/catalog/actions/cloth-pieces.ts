"use server";

/**
 * Cloth piece catalog server actions — T027, T028
 *
 * cloth_pieces: garment family (name/description, no price).
 * cloth_piece_variants: construction types with piece_rate.
 *
 * Only cashier_admin can mutate; secretary can read (T028).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  clothPieces,
  clothPieceVariants,
  catalogAuditLog,
  craftablePieces,
  employees,
} from "@befine/db/schema";
import { createClothPieceSchema, editClothPieceSchema } from "@befine/types";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";

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
  if (!hasRole(session.user, "cashier_admin")) return null;
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

// ─── Read actions (T028) ──────────────────────────────────────────────────────

export async function listActiveClothPieces(): Promise<ActionResult<ClothPieceRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
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
  if (!hasRole(session.user, "cashier_admin"))
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

  const db = getDb();
  const [piece] = await db
    .insert(clothPieces)
    .values({ name: parsed.data.name, description: parsed.data.description ?? null })
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

  await db
    .update(clothPieces)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(clothPieces.id, id));
  await writeAuditLog(db, {
    entityId: id,
    action: "update",
    changedBy: session.user.id,
    previousData: { name: existing.name, description: existing.description },
    newData: parsed.data,
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
  const db = getDb();
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

  const db = getDb();
  const [variant] = await db
    .insert(clothPieceVariants)
    .values({
      clothPieceId,
      name: parsed.data.name,
      pieceRate: parsed.data.pieceRate,
      sellingPrice: parsed.data.sellingPrice ?? null,
    })
    .returning();

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

  const db = getDb();
  const [updated] = await db
    .update(clothPieceVariants)
    .set({
      name: parsed.data.name,
      pieceRate: parsed.data.pieceRate,
      sellingPrice: parsed.data.sellingPrice ?? null,
      updatedAt: new Date(),
    })
    .where(eq(clothPieceVariants.id, variantId))
    .returning();

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
  const db = getDb();
  await db
    .update(clothPieceVariants)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(clothPieceVariants.id, variantId));
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
  const db = getDb();
  await db
    .update(clothPieceVariants)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(clothPieceVariants.id, variantId));
  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

// ─── Sell batch piece ─────────────────────────────────────────────────────────

const sellBatchPieceSchema = z.object({
  batchPieceId: z.string().uuid("ID de pieza inválido"),
  priceOverride: z.number().int().min(0).nullable().optional(),
});

/**
 * Marks an approved batch_piece as sold.
 * Snapshots the selling price from the variant (or a cashier override).
 * Gated to cashier_admin.
 */
export async function sellBatchPiece(
  rawInput: unknown,
): Promise<ActionResult<{ soldPrice: number }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = sellBatchPieceSchema.safeParse(rawInput);
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

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  const [piece] = await db
    .select({
      id: craftablePieces.id,
      status: craftablePieces.status,
      soldAt: craftablePieces.soldAt,
      clothPieceVariantId: craftablePieces.clothPieceVariantId,
    })
    .from(craftablePieces)
    .where(eq(craftablePieces.id, parsed.data.batchPieceId))
    .limit(1);

  if (!piece)
    return { success: false, error: { code: "NOT_FOUND", message: "Pieza no encontrada" } };
  if (piece.status !== "approved")
    return {
      success: false,
      error: { code: "CONFLICT", message: "Solo se pueden vender piezas aprobadas" },
    };
  if (piece.soldAt)
    return { success: false, error: { code: "CONFLICT", message: "Esta pieza ya fue vendida" } };

  const [variant] = await db
    .select({ sellingPrice: clothPieceVariants.sellingPrice })
    .from(clothPieceVariants)
    .where(eq(clothPieceVariants.id, piece.clothPieceVariantId))
    .limit(1);

  const effectivePrice = parsed.data.priceOverride ?? variant?.sellingPrice ?? null;
  if (effectivePrice === null)
    return {
      success: false,
      error: { code: "CONFLICT", message: "Esta variante no tiene precio de venta configurado" },
    };

  await db
    .update(craftablePieces)
    .set({
      soldAt: new Date(),
      soldPrice: effectivePrice,
      soldBy: emp?.id ?? null,
    })
    .where(
      and(eq(craftablePieces.id, parsed.data.batchPieceId), eq(craftablePieces.status, "approved")),
    );

  return { success: true, data: { soldPrice: effectivePrice } };
}
