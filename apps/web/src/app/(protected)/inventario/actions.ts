"use server";

/**
 * Inventario — T128 (spec §3.6, §3.8, §3.10)
 *
 * getInventory      admin, cashier — stock per garment × size × colour
 * getStockHistory   admin, cashier — movements of one item, each with its source
 * adjustStock       admin — signed adjustment with a reason ("conteo inicial",
 *                   "dañada", "devolución", other + note). Never below 0 unless
 *                   the admin ticks the override, which is logged. Serialised
 *                   per item; idempotent per submit (ref_id = the submit key).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  clothPieces,
  clothPieceVariants,
  garmentColors,
  garmentSizes,
  stockMovements,
} from "@befine/db/schema";
import {
  listStockItems,
  listStockMovements,
  type StockItem,
  type StockMovementRow,
} from "@befine/db";
import { adjustStockSchema, STOCK_ADJUST_LABELS } from "@befine/types";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getEmployeeRef } from "@/lib/employee-ref";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { actorOf, logActivity } from "@/lib/activity";
import { checkStockChange } from "@/lib/stock-rules";

type Fail = Extract<ActionResult<never>, { success: false }>;

export type InventoryOptions = {
  variants: { id: string; label: string }[];
  sizes: { id: string; label: string }[];
  colors: { id: string; label: string }[];
};

export type Inventory = {
  items: StockItem[];
  canAdjust: boolean;
  options: InventoryOptions;
};

async function guard(
  adjust: boolean,
): Promise<
  Fail | { user: { id: string; role?: string | null }; employeeId: string; isAdmin: boolean }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  const isAdmin = hasRole(session.user, "admin");
  if (!(adjust ? isAdmin : isAdmin || hasRole(session.user, "cashier")))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  const emp = await getEmployeeRef(session.user.id);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  return { user: session.user, employeeId: emp.id, isAdmin };
}

const itemSchema = z.object({
  clothPieceVariantId: z.uuid(),
  sizeId: z.uuid().nullable(),
  colorId: z.uuid().nullable(),
});

export async function getInventory(): Promise<ActionResult<Inventory>> {
  const g = await guard(false);
  if ("success" in g) return g;
  const db = getDb();
  const [items, variants, sizes, colors] = await Promise.all([
    listStockItems(db),
    db
      .select({
        id: clothPieceVariants.id,
        label: sql<string>`${clothPieces.name} || ' — ' || ${clothPieceVariants.name}`,
      })
      .from(clothPieceVariants)
      .innerJoin(clothPieces, eq(clothPieceVariants.clothPieceId, clothPieces.id))
      .where(and(eq(clothPieceVariants.isActive, true), eq(clothPieces.isActive, true)))
      .orderBy(asc(clothPieces.name), asc(clothPieceVariants.name)),
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
  ]);
  return {
    success: true,
    data: { items, canAdjust: g.isAdmin, options: { variants, sizes, colors } },
  };
}

export async function getStockHistory(rawItem: unknown): Promise<ActionResult<StockMovementRow[]>> {
  const g = await guard(false);
  if ("success" in g) return g;
  const parsed = itemSchema.safeParse(rawItem);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  return { success: true, data: await listStockMovements(getDb(), parsed.data) };
}

export async function adjustStock(rawInput: unknown): Promise<ActionResult<{ onHand: number }>> {
  const g = await guard(true);
  if ("success" in g) return g;
  const { allowed } = await checkRateLimit(rateLimits.general, g.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = adjustStockSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };
  const input = parsed.data;
  const reason = STOCK_ADJUST_LABELS[input.reasonCode] + (input.note ? `: ${input.note}` : "");

  const result = await getTxDb().transaction(async (tx) => {
    // Retried submit: the adjustment it already recorded.
    const [already] = await tx
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.refType, "adjustment"),
          eq(stockMovements.refId, input.idempotencyKey),
        ),
      );
    // Serialise changes to this one item so two adjustments can't both pass the check.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`stock:${input.clothPieceVariantId}:${input.sizeId ?? "-"}:${input.colorId ?? "-"}`}))`,
    );
    const onHandRes = await tx.execute(sql`
      SELECT coalesce(sum(quantity), 0)::int AS n FROM stock_movements
      WHERE cloth_piece_variant_id = ${input.clothPieceVariantId}
        AND size_id IS NOT DISTINCT FROM ${input.sizeId}::uuid
        AND color_id IS NOT DISTINCT FROM ${input.colorId}::uuid
    `);
    const onHand = Number((onHandRes.rows[0] as { n: number }).n);
    if (already) return { ok: true as const, onHand };

    const problem = checkStockChange({
      quantity: input.quantity,
      onHand,
      allowNegative: input.allowNegative,
    });
    if (problem) return { ok: false as const, problem };

    const labels = await tx.execute(sql`
      SELECT cp.name || ' — ' || v.name AS garment,
        (SELECT label FROM garment_sizes WHERE id = ${input.sizeId}::uuid) AS size,
        (SELECT label FROM garment_colors WHERE id = ${input.colorId}::uuid) AS color
      FROM cloth_piece_variants v JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
      WHERE v.id = ${input.clothPieceVariantId}
    `);
    const l = labels.rows[0] as
      | { garment: string; size: string | null; color: string | null }
      | undefined;
    if (!l) return { ok: false as const, problem: "La prenda no existe." };

    const after = onHand + input.quantity;
    const negative = after < 0;
    await tx.insert(stockMovements).values({
      clothPieceVariantId: input.clothPieceVariantId,
      sizeId: input.sizeId,
      colorId: input.colorId,
      quantity: input.quantity,
      kind: "adjustment",
      refType: "adjustment",
      refId: input.idempotencyKey,
      reason: negative ? `${reason} (autorizado por debajo de 0)` : reason,
      createdBy: g.employeeId,
    });
    const name = [l.garment, l.size, l.color].filter(Boolean).join(" · ");
    await logActivity(tx, {
      actor: actorOf(g.user),
      action: "stock.adjust",
      entityType: "stock",
      entityId: `${input.clothPieceVariantId}:${input.sizeId ?? "-"}:${input.colorId ?? "-"}`,
      summary:
        `Ajustó el inventario de ${name}: ${input.quantity > 0 ? "+" : ""}${input.quantity} (${onHand} → ${after})` +
        (negative ? " · autorizó quedar por debajo de 0" : ""),
      before: { onHand },
      after: { onHand: after, quantity: input.quantity, override: negative },
      reason,
    });
    return { ok: true as const, onHand: after };
  });

  if (!result.ok)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: result.problem,
        details: [{ field: "quantity", message: result.problem }],
      },
    };
  revalidatePath("/inventario");
  return { success: true, data: { onHand: result.onHand } };
}
