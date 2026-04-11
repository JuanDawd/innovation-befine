"use server";

/**
 * Checkout server actions — T038, T039, T040
 *
 * processCheckout: cashier_admin only. Creates checkout_session, ticket_payments,
 * closes all selected tickets — atomically, with optimistic locking.
 */

import { headers } from "next/headers";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  tickets,
  ticketItems,
  employees,
  clients,
  checkoutSessions,
  ticketPayments,
  services,
  serviceVariants,
} from "@befine/db/schema";
import { checkoutSessionSchema } from "@befine/types";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import { publishEvent } from "@befine/realtime/server";

export type CheckoutLineItem = {
  ticketItemId: string;
  ticketId: string;
  serviceName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  overridePrice: number | null;
  commissionPct: string;
};

export type CheckoutTicket = {
  id: string;
  status: string;
  clientName: string;
  lineItems: CheckoutLineItem[];
  total: number;
};

export type CheckoutSummary = {
  sessionId: string;
  tickets: CheckoutTicket[];
  grandTotal: number;
  payments: { method: string; amount: number }[];
  closedAt: Date;
};

// ─── Get awaiting_payment tickets for checkout ────────────────────────────────

export async function getAwaitingPaymentTickets(
  clientName?: string,
): Promise<ActionResult<CheckoutTicket[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();

  const rows = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      clientId: tickets.clientId,
      clientName: clients.name,
      guestName: tickets.guestName,
      ticketItemId: ticketItems.id,
      serviceName: services.name,
      variantName: serviceVariants.name,
      quantity: ticketItems.quantity,
      unitPrice: ticketItems.unitPrice,
      overridePrice: ticketItems.overridePrice,
      commissionPct: ticketItems.commissionPct,
    })
    .from(tickets)
    .leftJoin(clients, eq(tickets.clientId, clients.id))
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .where(and(eq(tickets.businessDayId, businessDay.id), eq(tickets.status, "awaiting_payment")))
    .orderBy(tickets.createdAt);

  // Group into tickets
  const ticketMap = new Map<string, CheckoutTicket>();
  for (const r of rows) {
    if (!ticketMap.has(r.id)) {
      ticketMap.set(r.id, {
        id: r.id,
        status: r.status,
        clientName: r.clientName ?? r.guestName ?? "—",
        lineItems: [],
        total: 0,
      });
    }
    const t = ticketMap.get(r.id)!;
    const effectivePrice = r.overridePrice ?? r.unitPrice;
    t.lineItems.push({
      ticketItemId: r.ticketItemId,
      ticketId: r.id,
      serviceName: r.serviceName,
      variantName: r.variantName,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      overridePrice: r.overridePrice,
      commissionPct: r.commissionPct,
    });
    t.total += effectivePrice * r.quantity;
  }

  let result = Array.from(ticketMap.values());
  if (clientName) {
    const q = clientName.toLowerCase();
    result = result.filter((t) => t.clientName.toLowerCase().includes(q));
  }

  return { success: true, data: result };
}

// ─── Process checkout ────────────────────────────────────────────────────────

export async function processCheckout(rawInput: unknown): Promise<ActionResult<CheckoutSummary>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const parsed = checkoutSessionSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos de pago inválidos",
        details: parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    };

  const input = parsed.data;
  const businessDay = await getCurrentBusinessDay();
  if (!businessDay)
    return {
      success: false,
      error: { code: "CONFLICT", message: "No hay un día laboral abierto" },
    };

  // Get cashier employee ID
  const db = getDb();
  const [cashierEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);
  if (!cashierEmp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  try {
    const result = await db.transaction(async (tx) => {
      // Idempotency check
      const existingSession = await tx
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, input.idempotencyKey))
        .limit(1);
      // Note: idempotencyKey is used as the session id for idempotency
      // (See below — we pass it as the id on insert if not already present)

      // Fetch tickets with version for optimistic locking
      const ticketRows = await tx
        .select({
          id: tickets.id,
          status: tickets.status,
          version: tickets.version,
          clientId: tickets.clientId,
          guestName: tickets.guestName,
        })
        .from(tickets)
        .where(inArray(tickets.id, input.ticketIds));

      if (ticketRows.length !== input.ticketIds.length) throw new Error("TICKET_NOT_FOUND");

      // All must be awaiting_payment
      const notReady = ticketRows.filter((t) => t.status !== "awaiting_payment");
      if (notReady.length > 0) throw new Error("TICKET_NOT_AWAITING");

      // Fetch line items to compute total
      const items = await tx
        .select({
          ticketId: ticketItems.ticketId,
          ticketItemId: ticketItems.id,
          unitPrice: ticketItems.unitPrice,
          overridePrice: ticketItems.overridePrice,
          quantity: ticketItems.quantity,
          commissionPct: ticketItems.commissionPct,
          serviceName: services.name,
          variantName: serviceVariants.name,
        })
        .from(ticketItems)
        .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
        .innerJoin(services, eq(serviceVariants.serviceId, services.id))
        .where(inArray(ticketItems.ticketId, input.ticketIds));

      const grandTotal = items.reduce((sum, item) => {
        return sum + (item.overridePrice ?? item.unitPrice) * item.quantity;
      }, 0);

      // Validate payment sum equals grand total
      const paymentSum = input.payments.reduce((s, p) => s + p.amount, 0);
      if (paymentSum !== grandTotal) throw new Error("PAYMENT_MISMATCH");

      // Determine client ID for session (first ticket's client, if all share one)
      const clientIds = [...new Set(ticketRows.map((t) => t.clientId).filter(Boolean))];
      const sessionClientId = clientIds.length === 1 ? (clientIds[0] ?? null) : null;

      // Create checkout session (use idempotencyKey as id for dedup)
      // First check if session with this id already exists
      const existingById = existingSession[0];
      let sessionId: string;
      if (existingById) {
        sessionId = existingById.id;
      } else {
        const [newSession] = await tx
          .insert(checkoutSessions)
          .values({
            id: input.idempotencyKey,
            businessDayId: businessDay.id,
            cashierId: cashierEmp.id,
            clientId: sessionClientId,
            totalAmount: grandTotal,
          })
          .returning({ id: checkoutSessions.id });
        sessionId = newSession.id;

        // Insert payment records
        await tx.insert(ticketPayments).values(
          input.payments.map((p) => ({
            checkoutSessionId: sessionId,
            method: p.method,
            amount: p.amount,
          })),
        );
      }

      // Close all tickets atomically using optimistic locking
      const closedAt = new Date();
      for (const t of ticketRows) {
        const [updated] = await tx
          .update(tickets)
          .set({
            status: "closed",
            closedAt,
            closedBy: cashierEmp.id,
            checkoutSessionId: sessionId,
            version: t.version + 1,
          })
          .where(and(eq(tickets.id, t.id), eq(tickets.version, t.version)))
          .returning({ id: tickets.id });
        if (!updated) throw new Error("STALE_DATA");
      }

      // Build summary for response
      const clientNames = new Map(
        ticketRows.map((t) => [t.id, t.clientId ? null : (t.guestName ?? "—")]),
      );
      // Fetch saved client names
      const savedClientIds = ticketRows.filter((t) => t.clientId).map((t) => t.clientId!);
      if (savedClientIds.length > 0) {
        const clientRows = await tx
          .select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(inArray(clients.id, savedClientIds));
        for (const c of clientRows) {
          for (const t of ticketRows.filter((tt) => tt.clientId === c.id)) {
            clientNames.set(t.id, c.name);
          }
        }
      }

      const byTicket = new Map<string, CheckoutTicket>();
      for (const item of items) {
        if (!byTicket.has(item.ticketId)) {
          byTicket.set(item.ticketId, {
            id: item.ticketId,
            status: "closed",
            clientName: clientNames.get(item.ticketId) ?? "—",
            lineItems: [],
            total: 0,
          });
        }
        const ct = byTicket.get(item.ticketId)!;
        const effectivePrice = item.overridePrice ?? item.unitPrice;
        ct.lineItems.push({
          ticketItemId: item.ticketItemId,
          ticketId: item.ticketId,
          serviceName: item.serviceName,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          overridePrice: item.overridePrice,
          commissionPct: item.commissionPct,
        });
        ct.total += effectivePrice * item.quantity;
      }

      return {
        sessionId,
        tickets: Array.from(byTicket.values()),
        grandTotal,
        payments: input.payments,
        closedAt,
      };
    });

    // Publish real-time events for each closed ticket
    for (const id of input.ticketIds) {
      publishEvent("cashier", "ticket_updated", { ticketId: id, status: "closed" });
    }
    revalidatePath("/cashier");

    return { success: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "TICKET_NOT_FOUND")
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Uno o más tickets no existen" },
      };
    if (msg === "TICKET_NOT_AWAITING")
      return {
        success: false,
        error: {
          code: "CONFLICT",
          message: "Todos los tickets deben estar en estado 'awaiting_payment'",
        },
      };
    if (msg === "PAYMENT_MISMATCH")
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "La suma de pagos no coincide con el total" },
      };
    if (msg === "STALE_DATA")
      return {
        success: false,
        error: {
          code: "STALE_DATA",
          message: "Uno o más tickets fueron modificados por otra sesión",
        },
      };
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Error al procesar el pago" },
    };
  }
}

// ─── Price override — T040 ────────────────────────────────────────────────────

const overridePriceSchema = z.object({
  ticketItemId: z.string().uuid(),
  overridePrice: z.number().int().nonnegative(),
  overrideReason: z.string().min(1).max(500),
});

export async function setOverridePrice(
  rawInput: unknown,
): Promise<ActionResult<{ ticketItemId: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const parsed = overridePriceSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Datos inválidos" },
    };

  const { ticketItemId, overridePrice, overrideReason } = parsed.data;
  const db = getDb();

  // Verify the ticket is not yet closed
  const [item] = await db
    .select({ id: ticketItems.id, ticketId: ticketItems.ticketId })
    .from(ticketItems)
    .where(eq(ticketItems.id, ticketItemId))
    .limit(1);

  if (!item) return { success: false, error: { code: "NOT_FOUND", message: "Ítem no encontrado" } };

  const [ticket] = await db
    .select({ status: tickets.status })
    .from(tickets)
    .where(eq(tickets.id, item.ticketId))
    .limit(1);

  if (!ticket || ticket.status === "closed")
    return {
      success: false,
      error: { code: "CONFLICT", message: "No se puede modificar un ticket cerrado" },
    };

  await db
    .update(ticketItems)
    .set({ overridePrice, overrideReason })
    .where(eq(ticketItems.id, ticketItemId));

  return { success: true, data: { ticketItemId } };
}

// ─── Admin override history — T040 ───────────────────────────────────────────

export type OverrideHistoryRow = {
  ticketItemId: string;
  ticketId: string;
  serviceName: string;
  originalPrice: number;
  overridePrice: number;
  delta: number;
  overrideReason: string;
  cashierName: string;
  closedAt: Date | null;
};

export async function listPriceOverrides(): Promise<ActionResult<OverrideHistoryRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const { users, employees: emps } = await import("@befine/db/schema");

  const rows = await db
    .select({
      ticketItemId: ticketItems.id,
      ticketId: ticketItems.ticketId,
      serviceName: services.name,
      originalPrice: ticketItems.unitPrice,
      overridePrice: ticketItems.overridePrice,
      overrideReason: ticketItems.overrideReason,
      closedAt: tickets.closedAt,
      cashierName: users.name,
    })
    .from(ticketItems)
    .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .leftJoin(emps, eq(tickets.closedBy, emps.id))
    .leftJoin(users, eq(emps.userId, users.id))
    .where(and(eq(tickets.status, "closed")))
    .orderBy(tickets.closedAt);

  return {
    success: true,
    data: rows
      .filter((r) => r.overridePrice !== null)
      .map((r) => ({
        ticketItemId: r.ticketItemId,
        ticketId: r.ticketId,
        serviceName: r.serviceName,
        originalPrice: r.originalPrice,
        overridePrice: r.overridePrice!,
        delta: r.overridePrice! - r.originalPrice,
        overrideReason: r.overrideReason ?? "",
        cashierName: r.cashierName ?? "—",
        closedAt: r.closedAt,
      })),
  };
}
