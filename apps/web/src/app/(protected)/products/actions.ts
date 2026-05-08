"use server";

/**
 * Product server actions — T045 / stab3.12
 *
 * listActiveClothiers: secretary/admin — for product assignment dropdowns.
 * createProduct: secretary/admin — creates a product + pieces, sends notifications.
 * getProductsDashboardData: secretary/admin — today's and WIP products.
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { employees, users, products, productPieces } from "@befine/db/schema";
import {
  createProductSchema,
  updateProductPieceSchema,
  type CreateProductInput,
  type UpdateProductPieceInput,
} from "@befine/types";
import { getProductsDashboard, getProductDetail } from "@befine/db";
import type { ProductDashboardRow, ProductDetailRow } from "@befine/db";
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

export type ProductRow = {
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
  if (!hasRole(session.user, "admin", "secretary"))
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

// ─── Create product ─────────────────────────────────────────────────────────

export async function createProduct(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin", "secretary"))
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

  const parsed = createProductSchema.safeParse(rawInput);
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

  const input: CreateProductInput = parsed.data;

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

  const autoApproved = hasRole(session.user, "admin");

  // Create product + pieces atomically
  const txDb = getTxDb();
  const productId = await txDb.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        businessDayId: businessDay.id,
        createdBy: creatorEmployee.id,
        notes: input.notes ?? null,
        largeOrderId: input.largeOrderId ?? null,
        autoApproved,
      })
      .returning({ id: products.id });

    if (input.pieces.length > 0) {
      await tx.insert(productPieces).values(
        input.pieces.map((p) => ({
          productId: product.id,
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

    return product.id;
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

  revalidatePath("/secretary/products");
  revalidatePath("/admin/products");

  return { success: true, data: { id: productId } };
}

// ─── Products dashboard ─────────────────────────────────────────────────────

export async function getProductsDashboardData(): Promise<ActionResult<ProductDashboardRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const rows = await getProductsDashboard(db);
  return { success: true, data: rows };
}

// ─── Product detail ─────────────────────────────────────────────────────────

export async function getProductDetailData(
  productId: string,
): Promise<ActionResult<ProductDetailRow>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const row = await getProductDetail(db, productId);
  if (!row) return { success: false, error: { code: "NOT_FOUND", message: "No encontrado" } };
  return { success: true, data: row };
}

// ─── Update product piece ───────────────────────────────────────────────────

export async function updateProductPiece(rawInput: unknown): Promise<ActionResult<void>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin", "secretary"))
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

  const parsed = updateProductPieceSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    };

  const input: UpdateProductPieceInput = parsed.data;

  const db = getDb();
  const result = await db
    .update(productPieces)
    .set({
      quantity: input.quantity,
      color: input.color ?? null,
      style: input.style ?? null,
      size: input.size ?? null,
      instructions: input.instructions ?? null,
      version: input.version + 1,
    })
    .where(and(eq(productPieces.id, input.id), eq(productPieces.version, input.version)))
    .returning({ id: productPieces.id });

  if (result.length === 0)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "Estado cambiado — recarga la página" },
    };

  revalidatePath("/secretary/products");
  revalidatePath("/admin/products");

  return { success: true, data: undefined };
}
