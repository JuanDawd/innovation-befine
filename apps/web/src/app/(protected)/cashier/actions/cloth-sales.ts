"use server";

import { headers } from "next/headers";
import { eq, desc, and, asc } from "drizzle-orm";
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
} from "@befine/db/schema";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";

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
  soldByName: string;
  createdAt: Date;
};

export type SellableClothPiece = {
  id: string;
  name: string;
  variants: {
    id: string;
    name: string;
    sellingPrice: number | null;
  }[];
};

// ─── Schema ───────────────────────────────────────────────────────────────────

const createClothSaleSchema = z
  .object({
    clothPieceVariantId: z.string().uuid("ID de variante inválido"),
    quantity: z.number().int().min(1, "La cantidad debe ser al menos 1"),
    priceOverride: z.number().int().min(0, "El precio no puede ser negativo").nullable().optional(),
    clientId: z.string().uuid().nullable().optional(),
    guestName: z.string().max(120).nullable().optional(),
    ticketId: z.string().uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((d) => !(d.clientId && d.guestName), {
    message: "No se puede especificar cliente y nombre de invitado al mismo tiempo",
    path: ["guestName"],
  });

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getCashierSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (!hasRole(session.user, "cashier", "admin", "secretary")) return null;
  return session;
}

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

// ─── List sellable cloth pieces ───────────────────────────────────────────────

export async function listSellableClothPieces(): Promise<ActionResult<SellableClothPiece[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier", "admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const rows = await db
    .select({
      pieceId: clothPieces.id,
      pieceName: clothPieces.name,
      variantId: clothPieceVariants.id,
      variantName: clothPieceVariants.name,
      sellingPrice: clothPieceVariants.sellingPrice,
    })
    .from(clothPieces)
    .innerJoin(clothPieceVariants, eq(clothPieceVariants.clothPieceId, clothPieces.id))
    .where(and(eq(clothPieces.isActive, true), eq(clothPieceVariants.isActive, true)))
    .orderBy(clothPieces.name, clothPieceVariants.name);

  const pieceMap = new Map<string, SellableClothPiece>();
  for (const r of rows) {
    if (!pieceMap.has(r.pieceId)) {
      pieceMap.set(r.pieceId, { id: r.pieceId, name: r.pieceName, variants: [] });
    }
    pieceMap.get(r.pieceId)!.variants.push({
      id: r.variantId,
      name: r.variantName,
      sellingPrice: r.sellingPrice,
    });
  }

  return { success: true, data: Array.from(pieceMap.values()) };
}

// ─── Create cloth sale ────────────────────────────────────────────────────────

export async function createClothSale(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; effectiveTotal: number }>> {
  const session = await getCashierSession();
  if (!session)
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "No autenticado o sin permisos" },
    };

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
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay)
    return { success: false, error: { code: "CONFLICT", message: "No hay día laboral abierto" } };

  const db = getDb();

  // Resolve the selling employee
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  // Resolve variant and snapshot the price
  const [variant] = await db
    .select({
      id: clothPieceVariants.id,
      sellingPrice: clothPieceVariants.sellingPrice,
      clothPieceId: clothPieceVariants.clothPieceId,
      isActive: clothPieceVariants.isActive,
    })
    .from(clothPieceVariants)
    .where(eq(clothPieceVariants.id, parsed.data.clothPieceVariantId))
    .limit(1);

  if (!variant)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };
  if (!variant.isActive)
    return { success: false, error: { code: "CONFLICT", message: "Esta variante no está activa" } };

  const unitPrice = parsed.data.priceOverride ?? variant.sellingPrice;
  if (unitPrice === null || unitPrice === undefined)
    return {
      success: false,
      error: { code: "CONFLICT", message: "Esta variante no tiene precio de venta configurado" },
    };

  // Validate optional ticket linkage
  if (parsed.data.ticketId) {
    const [ticket] = await db
      .select({ id: tickets.id, businessDayId: tickets.businessDayId })
      .from(tickets)
      .where(eq(tickets.id, parsed.data.ticketId))
      .limit(1);
    if (!ticket)
      return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };
    if (ticket.businessDayId !== businessDay.id)
      return {
        success: false,
        error: { code: "CONFLICT", message: "El ticket no pertenece al día laboral actual" },
      };
  }

  const txDb = getTxDb();
  const [sale] = await txDb.transaction(async (tx) => {
    return tx
      .insert(clothSales)
      .values({
        businessDayId: businessDay.id,
        ticketId: parsed.data.ticketId ?? null,
        clothPieceId: variant.clothPieceId,
        clothPieceVariantId: variant.id,
        quantity: parsed.data.quantity,
        unitPrice,
        priceOverride: parsed.data.priceOverride ?? null,
        clientId: parsed.data.clientId ?? null,
        guestName: parsed.data.guestName ?? null,
        soldBy: emp.id,
        notes: parsed.data.notes ?? null,
      })
      .returning({ id: clothSales.id });
  });

  revalidatePath("/cashier");
  return { success: true, data: { id: sale.id, effectiveTotal: unitPrice * parsed.data.quantity } };
}

// ─── List today's cloth sales ──────────────────────────────────────────────────

export async function listTodayClothSales(): Promise<ActionResult<ClothSaleRow[]>> {
  const session = await getCashierSession();
  if (!session)
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "No autenticado o sin permisos" },
    };

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
      soldByName: r.soldByName,
      createdAt: r.createdAt,
    })),
  };
}
