"use server";

import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { eq, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  clothSales,
  clothPieces,
  clothPieceVariants,
  employees,
  users,
  clients,
  tickets,
  stockMovements,
} from "@befine/db/schema";
import { formatPesos } from "@befine/db";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { getEmployeeRef } from "@/lib/employee-ref";
import { actorOf, logActivity } from "@/lib/activity";
import { checkSaleStock, stockLockKey } from "@/lib/stock-rules";
import { METHOD_ES } from "@/lib/payment-method-labels";

export type ClientOption = { id: string; name: string; phone: string | null };

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClothSaleRow = {
  id: string;
  clothPieceName: string;
  clothPieceVariantName: string;
  quantity: number;
  unitPrice: number;
  priceOverride: number | null;
  effectiveTotal: number;
  clientName: string | null;
  guestName: string | null;
  ticketId: string | null;
  paymentMethod: "cash" | "card" | "transfer" | null;
  soldByName: string;
  createdAt: Date;
};

/** One variant + size + colour that can be sold, with what is on hand (T129) */
export type SellableStockItem = {
  clothPieceId: string;
  clothPieceVariantId: string;
  sizeId: string | null;
  colorId: string | null;
  detailsKey: string;
  detailsLabel: string;
  garment: string;
  sizeLabel: string | null;
  colorLabel: string | null;
  sellingPrice: number | null;
  onHand: number;
};

export type SellableStock = {
  items: SellableStockItem[];
  /** Admin: may sell beyond what is on hand, with a reason */
  canOversell: boolean;
  /** No business day open: the sale is recorded after hours */
  afterHours: boolean;
};

// ─── Schema ───────────────────────────────────────────────────────────────────

const createClothSaleSchema = z
  .object({
    clothPieceVariantId: z.string().uuid("ID de variante inválido"),
    sizeId: z.uuid().nullable(),
    colorId: z.uuid().nullable(),
    detailsKey: z.string().max(1000).default(""),
    quantity: z.number().int().min(1, "La cantidad debe ser al menos 1").max(1000),
    priceOverride: z.number().int().min(0, "El precio no puede ser negativo").nullable().optional(),
    clientId: z.string().uuid().nullable().optional(),
    guestName: z.string().max(120).nullable().optional(),
    ticketId: z.string().uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    paymentMethod: z.enum(["cash", "card", "transfer"], "Selecciona el método de pago"),
    /** Admin only: sell more than is on hand (recorded with the reason) */
    oversell: z.boolean().optional(),
    oversellReason: z.string().trim().max(300).nullable().optional(),
    idempotencyKey: z.uuid("Clave de idempotencia inválida"),
  })
  .refine((d) => !(d.clientId && d.guestName), {
    message: "No se puede especificar cliente y nombre de invitado al mismo tiempo",
    path: ["guestName"],
  });

// ─── Auth helper ──────────────────────────────────────────────────────────────

/** Vender prenda is admin + cashier (spec §3.8) */
type SellerSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

async function getSellerSession(): Promise<
  { error: "UNAUTHORIZED" | "FORBIDDEN" } | { session: SellerSession }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "UNAUTHORIZED" as const };
  if (!hasRole(session.user, "cashier", "admin")) return { error: "FORBIDDEN" as const };
  return { session };
}

const denied = (code: "UNAUTHORIZED" | "FORBIDDEN") =>
  ({
    success: false,
    error: { code, message: code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos" },
  }) as const;

// ─── List active clients (for customer attachment) ────────────────────────────

export async function listClientsForSale(): Promise<ActionResult<ClientOption[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier", "admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const rows = await db
    .select({ id: clients.id, name: clients.name, phone: clients.phone })
    .from(clients)
    .where(eq(clients.isActive, true))
    .orderBy(asc(clients.name));

  return { success: true, data: rows };
}

// ─── What can be sold ─────────────────────────────────────────────────────────

/**
 * Active variants with stock, per size and colour. The admin also sees items
 * at 0 or below (to oversell with a reason); the cashier only what is on hand.
 */
export async function listSellableStock(): Promise<ActionResult<SellableStock>> {
  const g = await getSellerSession();
  if ("error" in g) return denied(g.error);
  const isAdmin = hasRole(g.session.user, "admin");
  const db = getDb();
  const [rows, day] = await Promise.all([
    db.execute(sql`
      SELECT v.cloth_piece_id, m.cloth_piece_variant_id, m.size_id, m.color_id, m.details_key,
        max(m.details_label) AS details_label,
        cp.name || ' — ' || v.name AS garment, gs.label AS size_label, gc.label AS color_label,
        v.selling_price, sum(m.quantity)::int AS on_hand
      FROM stock_movements m
      JOIN cloth_piece_variants v ON v.id = m.cloth_piece_variant_id AND v.is_active
      JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id AND cp.is_active
      LEFT JOIN garment_sizes gs ON gs.id = m.size_id
      LEFT JOIN garment_colors gc ON gc.id = m.color_id
      GROUP BY v.cloth_piece_id, m.cloth_piece_variant_id, m.size_id, m.color_id, m.details_key, cp.name,
        v.name, gs.label, gs.sort_order, gc.label, v.selling_price
      HAVING ${isAdmin} OR sum(m.quantity) > 0
      ORDER BY garment, gs.sort_order NULLS LAST, gc.label NULLS FIRST
    `),
    getCurrentBusinessDay(),
  ]);
  const items = (
    rows.rows as {
      cloth_piece_id: string;
      cloth_piece_variant_id: string;
      size_id: string | null;
      color_id: string | null;
      details_key: string;
      details_label: string;
      garment: string;
      size_label: string | null;
      color_label: string | null;
      selling_price: string | null;
      on_hand: number;
    }[]
  ).map((r) => ({
    clothPieceId: r.cloth_piece_id,
    clothPieceVariantId: r.cloth_piece_variant_id,
    sizeId: r.size_id,
    colorId: r.color_id,
    detailsKey: r.details_key,
    detailsLabel: r.details_label,
    garment: r.garment,
    sizeLabel: r.size_label,
    colorLabel: r.color_label,
    sellingPrice: r.selling_price === null ? null : Number(r.selling_price),
    onHand: Number(r.on_hand),
  }));
  return { success: true, data: { items, canOversell: isAdmin, afterHours: !day } };
}

// ─── Create cloth sale ────────────────────────────────────────────────────────

/**
 * Sells from stock (T129): a "sale" stock movement (−quantity) in the same
 * transaction as the sale, under the item's advisory lock, so two sales of
 * the last unit can't both succeed. Inside an open day the sale belongs to
 * it; with none open it is recorded after hours and attached when the next
 * day opens (attachAfterHoursPayments). Idempotent per submit.
 */
export async function createClothSale(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; effectiveTotal: number; afterHours: boolean }>> {
  const g = await getSellerSession();
  if ("error" in g) return denied(g.error);
  const session = g.session;
  const isAdmin = hasRole(session.user, "admin");

  const rl = await checkRateLimit(rateLimits.general, session.user.id);
  if (!rl.allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = createClothSaleSchema.safeParse(rawInput);
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

  const businessDay = await getCurrentBusinessDay();
  const db = getDb();

  const emp = await getEmployeeRef(session.user.id);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  const [variant] = await db
    .select({
      id: clothPieceVariants.id,
      sellingPrice: clothPieceVariants.sellingPrice,
      clothPieceId: clothPieceVariants.clothPieceId,
      isActive: clothPieceVariants.isActive,
    })
    .from(clothPieceVariants)
    .where(eq(clothPieceVariants.id, input.clothPieceVariantId))
    .limit(1);

  if (!variant)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };
  if (!variant.isActive)
    return { success: false, error: { code: "CONFLICT", message: "Esta variante no está activa" } };

  const unitPrice = input.priceOverride ?? variant.sellingPrice;
  if (unitPrice === null || unitPrice === undefined)
    return {
      success: false,
      error: { code: "CONFLICT", message: "Esta variante no tiene precio de venta configurado" },
    };

  // A sale can join a ticket only inside the ticket's (open) business day.
  if (input.ticketId) {
    if (!businessDay)
      return {
        success: false,
        error: { code: "CONFLICT", message: "Sin un día abierto la venta no se une a un ticket" },
      };
    const [ticket] = await db
      .select({ id: tickets.id, businessDayId: tickets.businessDayId })
      .from(tickets)
      .where(eq(tickets.id, input.ticketId))
      .limit(1);
    if (!ticket)
      return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };
    if (ticket.businessDayId !== businessDay.id)
      return {
        success: false,
        error: { code: "CONFLICT", message: "El ticket no pertenece al día laboral actual" },
      };
  }

  const item = {
    clothPieceVariantId: variant.id,
    sizeId: input.sizeId,
    colorId: input.colorId,
    detailsKey: input.detailsKey,
  };
  const sale = await getTxDb().transaction(async (tx) => {
    // Retried submit — return the sale that was already recorded.
    const [existing] = await tx
      .select({
        id: clothSales.id,
        unitPrice: clothSales.unitPrice,
        quantity: clothSales.quantity,
        afterHours: clothSales.afterHours,
      })
      .from(clothSales)
      .where(eq(clothSales.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) return { ok: true as const, ...existing, replayed: true };

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${stockLockKey(item)}))`);
    const onHandRes = await tx.execute(sql`
      SELECT coalesce(sum(quantity), 0)::int AS n,
        (SELECT cp.name || ' — ' || v.name FROM cloth_piece_variants v
          JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id WHERE v.id = ${variant.id}) AS garment,
        max(details_label) AS details_label,
        (SELECT label FROM garment_sizes WHERE id = ${input.sizeId}::uuid) AS size,
        (SELECT label FROM garment_colors WHERE id = ${input.colorId}::uuid) AS color
      FROM stock_movements
      WHERE cloth_piece_variant_id = ${variant.id}
        AND size_id IS NOT DISTINCT FROM ${input.sizeId}::uuid
        AND color_id IS NOT DISTINCT FROM ${input.colorId}::uuid
        AND details_key = ${input.detailsKey}
    `);
    const stock = onHandRes.rows[0] as {
      n: number;
      details_label: string | null;
      garment: string;
      size: string | null;
      color: string | null;
    };
    const onHand = Number(stock.n);
    const problem = checkSaleStock({
      quantity: input.quantity,
      onHand,
      isAdmin,
      oversell: input.oversell,
      oversellReason: input.oversellReason,
    });
    if (problem) return { ok: false as const, problem };
    const oversold = input.quantity > onHand;

    const afterHours = !businessDay;
    const [inserted] = await tx
      .insert(clothSales)
      .values({
        businessDayId: businessDay?.id ?? null,
        afterHours,
        ticketId: input.ticketId ?? null,
        clothPieceId: variant.clothPieceId,
        clothPieceVariantId: variant.id,
        sizeId: input.sizeId,
        colorId: input.colorId,
        detailsLabel: stock.details_label ?? "",
        quantity: input.quantity,
        unitPrice,
        priceOverride: input.priceOverride ?? null,
        clientId: input.clientId ?? null,
        guestName: input.guestName ?? null,
        soldBy: emp.id,
        notes: input.notes ?? null,
        paymentMethod: input.paymentMethod,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({
        id: clothSales.id,
        unitPrice: clothSales.unitPrice,
        quantity: clothSales.quantity,
      });

    const overReason = oversold
      ? `Venta sin existencias autorizada (${onHand} → ${onHand - input.quantity}): ${input.oversellReason}`
      : null;
    await tx.insert(stockMovements).values({
      ...item,
      detailsLabel: stock.details_label ?? "",
      quantity: -input.quantity,
      kind: "sale",
      refType: "cloth_sale",
      refId: inserted.id,
      reason: overReason,
      createdBy: emp.id,
    });

    const name = [stock.garment, stock.size, stock.color, stock.details_label]
      .filter(Boolean)
      .join(" · ");
    const total = (input.priceOverride ?? unitPrice) * input.quantity;
    await logActivity(tx, {
      actor: actorOf(session.user),
      action: "stock.sale",
      entityType: "stock",
      entityId: `${variant.id}:${input.sizeId ?? "-"}:${input.colorId ?? "-"}:${input.detailsKey}`,
      businessDayId: businessDay?.id ?? null,
      summary:
        `Vendió ${input.quantity} ${name} por ${formatPesos(total)} (${METHOD_ES[input.paymentMethod]})` +
        (afterHours ? " · fuera de horario" : "") +
        (oversold ? ` · sin existencias (${onHand} → ${onHand - input.quantity})` : ""),
      after: {
        saleId: inserted.id,
        quantity: input.quantity,
        total,
        onHand: onHand - input.quantity,
      },
      reason: oversold ? (input.oversellReason ?? null) : null,
    });
    return { ok: true as const, ...inserted, afterHours, replayed: false };
  });

  if (!sale.ok)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: sale.problem,
        details: [{ field: "quantity", message: sale.problem }],
      },
    };

  const effectiveTotal = sale.unitPrice * sale.quantity;
  Sentry.addBreadcrumb({
    category: "financial",
    message: sale.replayed ? "createClothSale replayed" : "createClothSale",
    data: {
      saleId: sale.id,
      businessDayId: businessDay?.id ?? null,
      afterHours: sale.afterHours,
      total: effectiveTotal,
      paymentMethod: input.paymentMethod,
    },
  });

  revalidatePath("/cashier");
  revalidatePath("/inventario");
  return {
    success: true,
    data: { id: sale.id, effectiveTotal, afterHours: sale.afterHours },
  };
}

// ─── List today's cloth sales ──────────────────────────────────────────────────

export async function listTodayClothSales(): Promise<ActionResult<ClothSaleRow[]>> {
  const g = await getSellerSession();
  if ("error" in g) return denied(g.error);

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();
  const rows = await db
    .select({
      id: clothSales.id,
      clothPieceName: clothPieces.name,
      clothPieceVariantName: clothPieceVariants.name,
      quantity: clothSales.quantity,
      unitPrice: clothSales.unitPrice,
      priceOverride: clothSales.priceOverride,
      clientName: clients.name,
      guestName: clothSales.guestName,
      ticketId: clothSales.ticketId,
      paymentMethod: clothSales.paymentMethod,
      soldByName: users.name,
      createdAt: clothSales.createdAt,
    })
    .from(clothSales)
    .innerJoin(clothPieces, eq(clothSales.clothPieceId, clothPieces.id))
    .innerJoin(clothPieceVariants, eq(clothSales.clothPieceVariantId, clothPieceVariants.id))
    .innerJoin(employees, eq(clothSales.soldBy, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .leftJoin(clients, eq(clothSales.clientId, clients.id))
    .where(eq(clothSales.businessDayId, businessDay.id))
    .orderBy(desc(clothSales.createdAt));

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      clothPieceName: r.clothPieceName,
      clothPieceVariantName: r.clothPieceVariantName,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      priceOverride: r.priceOverride,
      effectiveTotal: (r.priceOverride ?? r.unitPrice) * r.quantity,
      clientName: r.clientName ?? null,
      guestName: r.guestName ?? null,
      ticketId: r.ticketId,
      paymentMethod: r.paymentMethod,
      soldByName: r.soldByName,
      createdAt: r.createdAt,
    })),
  };
}
