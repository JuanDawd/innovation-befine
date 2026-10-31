"use server";

/**
 * Product details — T137
 *
 * Admin-only. Details are never deleted: deactivating hides one from new choices and
 * keeps it on the records that use it. Talla and Color keep their values in
 * garment_sizes and garment_colors, so their rules here can't be changed.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  clothPieces,
  details,
  detailValues,
  garmentColors,
  garmentSizes,
  productDetails,
  productDetailValues,
} from "@befine/db/schema";
import { detailSchema, detailValueSchema, productDetailsSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { hasRole } from "@/lib/middleware-helpers";
import { isUniqueViolation } from "@/lib/pg-error";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";

export type DetailValueRow = { id: string; label: string; isActive: boolean };

export type DetailRow = {
  id: string;
  name: string;
  builtin: string | null;
  splitsStock: boolean;
  allowFreeText: boolean;
  isActive: boolean;
  values: DetailValueRow[];
};

export type ProductDetailRow = {
  detailId: string;
  name: string;
  builtin: string | null;
  values: { id: string; label: string }[];
  used: boolean;
  required: boolean;
  allValues: boolean;
  valueIds: string[];
};

type Fail = Extract<ActionResult<never>, { success: false }>;
type Actor = { userId: string; role: string | null };

const idSchema = z.uuid();
const fail = (code: Fail["error"]["code"], message: string): Fail => ({
  success: false,
  error: { code, message },
});
const notFound = fail("NOT_FOUND", "Detalle no encontrado");
const duplicate = (message: string) => fail("CONFLICT", message);

async function gate(rateLimited = true): Promise<{ actor: Actor } | Fail> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return fail("UNAUTHORIZED", "No autenticado");
  if (!hasRole(session.user, "admin")) return fail("FORBIDDEN", "Sin permisos");
  if (rateLimited) {
    const { allowed } = await checkRateLimit(rateLimits.catalogEdit, session.user.id);
    if (!allowed) return fail("RATE_LIMITED", "Demasiadas solicitudes. Intenta en un minuto.");
  }
  return { actor: actorOf(session.user) };
}

function invalid(error: z.ZodError): Fail {
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "Datos inválidos",
      details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    },
  };
}

export async function listDetails(): Promise<ActionResult<DetailRow[]>> {
  const g = await gate(false);
  if ("success" in g) return g;
  const db = getDb();
  const [rows, values] = await Promise.all([
    db.select().from(details).orderBy(asc(details.sortOrder), asc(details.name)),
    db.select().from(detailValues).orderBy(asc(detailValues.sortOrder), asc(detailValues.label)),
  ]);
  return {
    success: true,
    data: rows.map((d) => ({
      id: d.id,
      name: d.name,
      builtin: d.builtin,
      splitsStock: d.splitsStock,
      allowFreeText: d.allowFreeText,
      isActive: d.isActive,
      values: values
        .filter((v) => v.detailId === d.id)
        .map((v) => ({ id: v.id, label: v.label, isActive: v.isActive })),
    })),
  };
}

export async function createDetail(rawInput: unknown): Promise<ActionResult<DetailRow>> {
  const g = await gate();
  if ("success" in g) return g;
  const parsed = detailSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const row = await getTxDb().transaction(async (tx) => {
      const [created] = await tx.insert(details).values(parsed.data).returning();
      await logActivity(tx as unknown as ActivityTx, {
        actor: g.actor,
        action: "catalog.create",
        entityType: "detail",
        entityId: created!.id,
        data: { name: created!.name },
        after: parsed.data,
      });
      return created!;
    });
    revalidatePath("/admin/catalog");
    return {
      success: true,
      data: {
        id: row.id,
        name: row.name,
        builtin: null,
        splitsStock: row.splitsStock,
        allowFreeText: row.allowFreeText,
        isActive: true,
        values: [],
      },
    };
  } catch (err) {
    if (isUniqueViolation(err)) return duplicate("Ya existe un detalle con ese nombre.");
    throw err;
  }
}

export async function updateDetail(id: string, rawInput: unknown): Promise<ActionResult<null>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(id).success) return notFound;
  const parsed = detailSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return await getTxDb().transaction(async (tx): Promise<ActionResult<null>> => {
      const [before] = await tx.select().from(details).where(eq(details.id, id)).for("update");
      if (!before) return notFound;
      // A built-in detail's rules are how its columns work; only its name is free.
      const values = before.builtin ? { name: parsed.data.name } : parsed.data;
      await tx
        .update(details)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(details.id, id));
      await logActivity(tx as unknown as ActivityTx, {
        actor: g.actor,
        action: "catalog.update",
        entityType: "detail",
        entityId: id,
        data: { name: parsed.data.name },
        before: {
          name: before.name,
          splitsStock: before.splitsStock,
          allowFreeText: before.allowFreeText,
        },
        after: values,
      });
      revalidatePath("/admin/catalog");
      return { success: true, data: null };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return duplicate("Ya existe un detalle con ese nombre.");
    throw err;
  }
}

export async function setDetailActive(id: string, active: boolean): Promise<ActionResult<null>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(id).success || typeof active !== "boolean") return notFound;
  return getTxDb().transaction(async (tx): Promise<ActionResult<null>> => {
    const [row] = await tx
      .update(details)
      .set({ isActive: active, updatedAt: new Date() })
      .where(and(eq(details.id, id), sql`${details.builtin} IS NULL`))
      .returning();
    if (!row) return notFound;
    await logActivity(tx as unknown as ActivityTx, {
      actor: g.actor,
      action: active ? "catalog.restore" : "catalog.deactivate",
      entityType: "detail",
      entityId: id,
      data: { name: row.name },
    });
    revalidatePath("/admin/catalog");
    return { success: true, data: null };
  });
}

export async function addDetailValue(
  detailId: string,
  rawInput: unknown,
): Promise<ActionResult<DetailValueRow>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(detailId).success) return notFound;
  const parsed = detailValueSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return await getTxDb().transaction(async (tx): Promise<ActionResult<DetailValueRow>> => {
      const [detail] = await tx.select().from(details).where(eq(details.id, detailId));
      if (!detail) return notFound;
      if (detail.builtin)
        return fail("CONFLICT", "Los valores de este detalle se manejan en su propia lista.");
      const [row] = await tx
        .insert(detailValues)
        .values({ detailId, label: parsed.data.label })
        .returning();
      await logActivity(tx as unknown as ActivityTx, {
        actor: g.actor,
        action: "catalog.update",
        entityType: "detail",
        entityId: detailId,
        data: { name: detail.name },
        after: { addedValue: parsed.data.label },
      });
      revalidatePath("/admin/catalog");
      return { success: true, data: { id: row!.id, label: row!.label, isActive: true } };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return duplicate("Ese valor ya existe.");
    throw err;
  }
}

export async function setDetailValueActive(
  valueId: string,
  active: boolean,
): Promise<ActionResult<null>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(valueId).success || typeof active !== "boolean") return notFound;
  return getTxDb().transaction(async (tx): Promise<ActionResult<null>> => {
    const [row] = await tx
      .update(detailValues)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(detailValues.id, valueId))
      .returning();
    if (!row) return notFound;
    await logActivity(tx as unknown as ActivityTx, {
      actor: g.actor,
      action: "catalog.update",
      entityType: "detail",
      entityId: row.detailId,
      data: { name: row.label },
      after: { value: row.label, isActive: active },
    });
    revalidatePath("/admin/catalog");
    return { success: true, data: null };
  });
}

export async function getProductDetails(
  clothPieceId: string,
): Promise<ActionResult<ProductDetailRow[]>> {
  const g = await gate(false);
  if ("success" in g) return g;
  if (!idSchema.safeParse(clothPieceId).success) return notFound;
  const db = getDb();
  const [all, values, sizes, colors, used, chosen] = await Promise.all([
    db.select().from(details).orderBy(asc(details.sortOrder), asc(details.name)),
    db
      .select()
      .from(detailValues)
      .where(eq(detailValues.isActive, true))
      .orderBy(asc(detailValues.sortOrder), asc(detailValues.label)),
    db
      .select({ id: garmentSizes.id, label: garmentSizes.label })
      .from(garmentSizes)
      .where(eq(garmentSizes.isActive, true))
      .orderBy(asc(garmentSizes.sortOrder)),
    db
      .select({ id: garmentColors.id, label: garmentColors.label })
      .from(garmentColors)
      .where(eq(garmentColors.isActive, true))
      .orderBy(asc(garmentColors.label)),
    db.select().from(productDetails).where(eq(productDetails.clothPieceId, clothPieceId)),
    db.select().from(productDetailValues).where(eq(productDetailValues.clothPieceId, clothPieceId)),
  ]);
  return {
    success: true,
    data: all
      .filter((d) => d.isActive || used.some((u) => u.detailId === d.id))
      .map((d) => {
        const link = used.find((u) => u.detailId === d.id);
        return {
          detailId: d.id,
          name: d.name,
          builtin: d.builtin,
          values:
            d.builtin === "size"
              ? sizes
              : d.builtin === "color"
                ? colors
                : values
                    .filter((v) => v.detailId === d.id)
                    .map((v) => ({ id: v.id, label: v.label })),
          used: Boolean(link),
          required: link?.required ?? false,
          allValues: link?.allValues ?? true,
          valueIds: chosen.filter((c) => c.detailId === d.id).map((c) => c.valueId),
        };
      }),
  };
}

export async function saveProductDetails(
  clothPieceId: string,
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(clothPieceId).success) return notFound;
  const parsed = productDetailsSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data.details;

  return getTxDb().transaction(async (tx): Promise<ActionResult<null>> => {
    const [piece] = await tx
      .select({ name: clothPieces.name })
      .from(clothPieces)
      .where(eq(clothPieces.id, clothPieceId))
      .for("update");
    if (!piece) return fail("NOT_FOUND", "Producto no encontrado");
    // Assignments, reports and deliveries all work per size.
    const [talla] = await tx
      .select({ id: details.id })
      .from(details)
      .where(eq(details.builtin, "size"));
    if (talla && !input.some((d) => d.detailId === talla.id))
      return fail("VALIDATION_ERROR", "Todo producto usa Talla.");
    await tx.delete(productDetailValues).where(eq(productDetailValues.clothPieceId, clothPieceId));
    await tx.delete(productDetails).where(eq(productDetails.clothPieceId, clothPieceId));
    if (input.length)
      await tx.insert(productDetails).values(
        input.map((d) => ({
          clothPieceId,
          detailId: d.detailId,
          required: d.required,
          allValues: d.allValues,
        })),
      );
    const chosen = input
      .filter((d) => !d.allValues)
      .flatMap((d) =>
        [...new Set(d.valueIds)].map((valueId) => ({
          clothPieceId,
          detailId: d.detailId,
          valueId,
        })),
      );
    if (chosen.length) await tx.insert(productDetailValues).values(chosen);
    await logActivity(tx as unknown as ActivityTx, {
      actor: g.actor,
      action: "catalog.update",
      entityType: "cloth_piece",
      entityId: clothPieceId,
      data: { name: piece.name },
      after: { details: input },
    });
    revalidatePath("/admin/catalog");
    return { success: true, data: null };
  });
}
