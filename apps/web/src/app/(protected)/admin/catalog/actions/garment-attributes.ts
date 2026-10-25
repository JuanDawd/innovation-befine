"use server";

/**
 * Garment sizes and colours server actions — T110
 *
 * Admin-only lists used by pedido size grids and the stock ledger.
 * Never deleted: deactivation hides an entry from pickers but keeps it on
 * the records that already reference it. Every change is written to the
 * activity log in the same transaction (T114).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { garmentColors, garmentSizes } from "@befine/db/schema";
import { garmentColorSchema, garmentSizeSchema, reorderGarmentSizesSchema } from "@befine/types";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GarmentSizeRow = {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type GarmentColorRow = {
  id: string;
  label: string;
  hex: string | null;
  isActive: boolean;
};

type Fail = Extract<ActionResult<never>, { success: false }>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Actor = { userId: string; role: string | null };

/** Session + admin gate + catalog rate limit. Returns the actor or a failure. */
async function gate(limit = rateLimits.catalogEdit): Promise<{ actor: Actor } | Fail> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  const { allowed } = await checkRateLimit(limit, session.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  return { actor: actorOf(session.user) };
}

function validationError(error: z.ZodError): Fail {
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Datos inválidos",
      details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    },
  };
}

/** Postgres unique violation, raw or wrapped by Drizzle. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const CATALOG_ACTION = {
  create: "catalog.create",
  update: "catalog.update",
  soft_delete: "catalog.deactivate",
  restore: "catalog.restore",
  reorder: "catalog.reorder",
} as const;

function audit(
  tx: ActivityTx,
  params: {
    entityType: "garment_size" | "garment_color";
    entityId: string;
    action: keyof typeof CATALOG_ACTION;
    actor: Actor;
    name: string;
    previousData?: unknown;
    newData?: unknown;
  },
) {
  return logActivity(tx, {
    actor: params.actor,
    action: CATALOG_ACTION[params.action],
    entityType: params.entityType,
    entityId: params.entityId,
    data: { name: params.name },
    before: params.previousData,
    after: params.newData,
  });
}

const idSchema = z.uuid();
const activeSchema = z.boolean();

const notFound = (message: string): Fail => ({
  success: false,
  error: { code: "NOT_FOUND", message },
});

// ─── Read ────────────────────────────────────────────────────────────────────

export async function listGarmentAttributes(): Promise<
  ActionResult<{ sizes: GarmentSizeRow[]; colors: GarmentColorRow[] }>
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const [sizes, colors] = await Promise.all([
    db
      .select({
        id: garmentSizes.id,
        label: garmentSizes.label,
        sortOrder: garmentSizes.sortOrder,
        isActive: garmentSizes.isActive,
      })
      .from(garmentSizes)
      .orderBy(asc(garmentSizes.sortOrder), asc(garmentSizes.label)),
    db
      .select({
        id: garmentColors.id,
        label: garmentColors.label,
        hex: garmentColors.hex,
        isActive: garmentColors.isActive,
      })
      .from(garmentColors)
      .orderBy(asc(garmentColors.label)),
  ]);
  return { success: true, data: { sizes, colors } };
}

// ─── Sizes ───────────────────────────────────────────────────────────────────

export async function createGarmentSize(rawInput: unknown): Promise<ActionResult<GarmentSizeRow>> {
  const g = await gate();
  if ("success" in g) return g;
  const parsed = garmentSizeSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const row = await getTxDb().transaction(async (tx) => {
      // New sizes go to the end of the grid.
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${garmentSizes.sortOrder}), 0) + 10` })
        .from(garmentSizes);
      const [created] = await tx
        .insert(garmentSizes)
        .values({ label: parsed.data.label, sortOrder: Number(next) })
        .returning({
          id: garmentSizes.id,
          label: garmentSizes.label,
          sortOrder: garmentSizes.sortOrder,
          isActive: garmentSizes.isActive,
        });
      await audit(tx, {
        entityType: "garment_size",
        entityId: created.id,
        action: "create",
        actor: g.actor,
        name: created.label,
        newData: { label: created.label, sortOrder: created.sortOrder },
      });
      return created;
    });
    revalidatePath("/admin/catalog");
    return { success: true, data: row };
  } catch (err) {
    if (isUniqueViolation(err))
      return { success: false, error: { code: "CONFLICT", message: "Esa talla ya existe" } };
    throw err;
  }
}

export async function renameGarmentSize(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<GarmentSizeRow>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(id).success) return notFound("ID inválido");
  const parsed = garmentSizeSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const row = await getTxDb().transaction(async (tx) => {
      const [existing] = await tx
        .select({ label: garmentSizes.label })
        .from(garmentSizes)
        .where(eq(garmentSizes.id, id))
        .for("update");
      if (!existing) return null;
      const [updated] = await tx
        .update(garmentSizes)
        .set({ label: parsed.data.label, updatedAt: new Date() })
        .where(eq(garmentSizes.id, id))
        .returning({
          id: garmentSizes.id,
          label: garmentSizes.label,
          sortOrder: garmentSizes.sortOrder,
          isActive: garmentSizes.isActive,
        });
      await audit(tx, {
        entityType: "garment_size",
        entityId: id,
        action: "update",
        actor: g.actor,
        name: updated.label,
        previousData: { label: existing.label },
        newData: { label: updated.label },
      });
      return updated;
    });
    if (!row) return notFound("Talla no encontrada");
    revalidatePath("/admin/catalog");
    return { success: true, data: row };
  } catch (err) {
    if (isUniqueViolation(err))
      return { success: false, error: { code: "CONFLICT", message: "Esa talla ya existe" } };
    throw err;
  }
}

export async function setGarmentSizeActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(id).success) return notFound("ID inválido");
  if (!activeSchema.safeParse(isActive).success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const found = await getTxDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(garmentSizes)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(garmentSizes.id, id))
      .returning({ id: garmentSizes.id, label: garmentSizes.label });
    if (!updated) return false;
    await audit(tx, {
      entityType: "garment_size",
      entityId: id,
      action: isActive ? "restore" : "soft_delete",
      actor: g.actor,
      name: updated.label,
      previousData: { isActive: !isActive },
      newData: { isActive },
    });
    return true;
  });
  if (!found) return notFound("Talla no encontrada");
  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

/**
 * Rewrites sort_order from the full list the admin sees. Rejected as
 * STALE_DATA when the list no longer matches the table (a size was added
 * meanwhile), so a stale screen cannot drop a size out of the order.
 */
export async function reorderGarmentSizes(
  rawInput: unknown,
): Promise<ActionResult<GarmentSizeRow[]>> {
  // Each arrow press is a call — use the general budget, not the 20/min catalog one.
  const g = await gate(rateLimits.general);
  if ("success" in g) return g;
  const parsed = reorderGarmentSizesSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const { ids } = parsed.data;
  if (new Set(ids).size !== ids.length)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "La lista tiene tallas repetidas" },
    };

  const rows = await getTxDb().transaction(async (tx) => {
    const current = await tx
      .select({ id: garmentSizes.id, label: garmentSizes.label, sortOrder: garmentSizes.sortOrder })
      .from(garmentSizes)
      .for("update");
    const byId = new Map(current.map((r) => [r.id, r]));
    if (current.length !== ids.length || ids.some((id) => !byId.has(id))) return null;

    for (const [i, id] of ids.entries()) {
      const sortOrder = (i + 1) * 10;
      const { label, sortOrder: previous } = byId.get(id)!;
      if (previous === sortOrder) continue;
      await tx
        .update(garmentSizes)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(garmentSizes.id, id));
      await audit(tx, {
        entityType: "garment_size",
        entityId: id,
        action: "reorder",
        actor: g.actor,
        name: label,
        previousData: { sortOrder: previous },
        newData: { sortOrder },
      });
    }
    return tx
      .select({
        id: garmentSizes.id,
        label: garmentSizes.label,
        sortOrder: garmentSizes.sortOrder,
        isActive: garmentSizes.isActive,
      })
      .from(garmentSizes)
      .orderBy(asc(garmentSizes.sortOrder), asc(garmentSizes.label));
  });
  if (!rows)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "La lista cambió. Recarga la página." },
    };
  revalidatePath("/admin/catalog");
  return { success: true, data: rows };
}

// ─── Colours ─────────────────────────────────────────────────────────────────

export async function createGarmentColor(
  rawInput: unknown,
): Promise<ActionResult<GarmentColorRow>> {
  const g = await gate();
  if ("success" in g) return g;
  const parsed = garmentColorSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const hex = parsed.data.hex?.toUpperCase() ?? null;

  try {
    const row = await getTxDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(garmentColors)
        .values({ label: parsed.data.label, hex })
        .returning({
          id: garmentColors.id,
          label: garmentColors.label,
          hex: garmentColors.hex,
          isActive: garmentColors.isActive,
        });
      await audit(tx, {
        entityType: "garment_color",
        entityId: created.id,
        action: "create",
        actor: g.actor,
        name: created.label,
        newData: { label: created.label, hex: created.hex },
      });
      return created;
    });
    revalidatePath("/admin/catalog");
    return { success: true, data: row };
  } catch (err) {
    if (isUniqueViolation(err))
      return { success: false, error: { code: "CONFLICT", message: "Ese color ya existe" } };
    throw err;
  }
}

export async function editGarmentColor(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<GarmentColorRow>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(id).success) return notFound("ID inválido");
  const parsed = garmentColorSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const hex = parsed.data.hex?.toUpperCase() ?? null;

  try {
    const row = await getTxDb().transaction(async (tx) => {
      const [existing] = await tx
        .select({ label: garmentColors.label, hex: garmentColors.hex })
        .from(garmentColors)
        .where(eq(garmentColors.id, id))
        .for("update");
      if (!existing) return null;
      const [updated] = await tx
        .update(garmentColors)
        .set({ label: parsed.data.label, hex, updatedAt: new Date() })
        .where(eq(garmentColors.id, id))
        .returning({
          id: garmentColors.id,
          label: garmentColors.label,
          hex: garmentColors.hex,
          isActive: garmentColors.isActive,
        });
      await audit(tx, {
        entityType: "garment_color",
        entityId: id,
        action: "update",
        actor: g.actor,
        name: updated.label,
        previousData: existing,
        newData: { label: updated.label, hex: updated.hex },
      });
      return updated;
    });
    if (!row) return notFound("Color no encontrado");
    revalidatePath("/admin/catalog");
    return { success: true, data: row };
  } catch (err) {
    if (isUniqueViolation(err))
      return { success: false, error: { code: "CONFLICT", message: "Ese color ya existe" } };
    throw err;
  }
}

export async function setGarmentColorActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  const g = await gate();
  if ("success" in g) return g;
  if (!idSchema.safeParse(id).success) return notFound("ID inválido");
  if (!activeSchema.safeParse(isActive).success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const found = await getTxDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(garmentColors)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(garmentColors.id, id))
      .returning({ id: garmentColors.id, label: garmentColors.label });
    if (!updated) return false;
    await audit(tx, {
      entityType: "garment_color",
      entityId: id,
      action: isActive ? "restore" : "soft_delete",
      actor: g.actor,
      name: updated.label,
      previousData: { isActive: !isActive },
      newData: { isActive },
    });
    return true;
  });
  if (!found) return notFound("Color no encontrado");
  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}
