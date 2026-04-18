"use server";

/**
 * Closed ticket history actions — T092, T042
 *
 * listBusinessDays: returns all business days for day navigation (admin/cashier).
 * listClosedTickets: returns closed tickets for a given business day, with optional client search.
 * getClosedTicketDetail: returns full detail (line items + payment breakdown) for one ticket.
 * reopenTicket: transitions a closed ticket back to reopened status (cashier_admin only).
 */

import { headers } from "next/headers";
import { eq, and, or, ilike, desc, inArray, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  tickets,
  ticketItems,
  ticketPayments,
  employees,
  users,
  clients,
  services,
  serviceVariants,
  businessDays,
  checkoutSessions,
} from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { revalidatePath } from "next/cache";
import { publishEvent } from "@befine/realtime/server";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { transitionTicketSchema } from "@befine/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BusinessDayOption = {
  id: string;
  openedAt: Date;
  closedAt: Date | null;
};

export type ClosedTicketRow = {
  id: string;
  clientName: string;
  employeeName: string;
  serviceSummary: string; // "ServiceName — VariantName" of first item
  total: number;
  paymentMethods: string[];
  closedAt: Date | null;
  closedByName: string;
  hasOverride: boolean;
};

export type ClosedTicketLineItem = {
  id: string;
  serviceName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  overridePrice: number | null;
  overrideReason: string | null;
  effectivePrice: number;
};

export type ClosedTicketPayment = {
  method: string;
  amount: number;
};

export type ClosedTicketDetail = {
  id: string;
  clientName: string;
  employeeName: string;
  closedAt: Date | null;
  closedByName: string;
  lineItems: ClosedTicketLineItem[];
  payments: ClosedTicketPayment[];
  total: number;
};

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireAdminOrCashier() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, code: "UNAUTHORIZED" as const, userId: null };
  if (!hasRole(session.user, "cashier_admin"))
    return { ok: false, code: "FORBIDDEN" as const, userId: null };
  return { ok: true, code: null, userId: session.user.id };
}

// ─── List business days ───────────────────────────────────────────────────────

export async function listBusinessDays(): Promise<ActionResult<BusinessDayOption[]>> {
  const guard = await requireAdminOrCashier();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code!,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const rows = await db
    .select({
      id: businessDays.id,
      openedAt: businessDays.openedAt,
      closedAt: businessDays.closedAt,
    })
    .from(businessDays)
    .orderBy(desc(businessDays.openedAt))
    .limit(90);

  return { success: true, data: rows };
}

// ─── List closed tickets for a business day ───────────────────────────────────

export async function listClosedTickets(
  businessDayId: string,
  search?: string,
): Promise<ActionResult<ClosedTicketRow[]>> {
  const guard = await requireAdminOrCashier();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code!,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();

  const rows = await db
    .select({
      id: tickets.id,
      clientName: clients.name,
      guestName: tickets.guestName,
      employeeName: users.name,
      serviceName: services.name,
      variantName: serviceVariants.name,
      unitPrice: ticketItems.unitPrice,
      overridePrice: ticketItems.overridePrice,
      quantity: ticketItems.quantity,
      closedAt: tickets.closedAt,
      closedBy: tickets.closedBy,
      checkoutSessionId: tickets.checkoutSessionId,
    })
    .from(tickets)
    .leftJoin(clients, eq(tickets.clientId, clients.id))
    .innerJoin(employees, eq(tickets.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .where(
      and(
        eq(tickets.businessDayId, businessDayId),
        eq(tickets.status, "closed"),
        search
          ? or(ilike(clients.name, `%${search}%`), ilike(tickets.guestName, `%${search}%`))
          : undefined,
      ),
    )
    .orderBy(desc(tickets.closedAt));

  // Resolve closedBy names in one query
  const closerIds = [...new Set(rows.map((r) => r.closedBy).filter(Boolean))] as string[];
  const closerNames = new Map<string, string>();
  if (closerIds.length > 0) {
    const closerRows = await db
      .select({ empId: employees.id, name: users.name })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(inArray(employees.id, closerIds));
    for (const c of closerRows) closerNames.set(c.empId, c.name);
  }

  // Resolve payment methods per checkout session in one query
  const sessionIds = [...new Set(rows.map((r) => r.checkoutSessionId).filter(Boolean))] as string[];
  const sessionPayments = new Map<string, string[]>();
  if (sessionIds.length > 0) {
    const payRows = await db
      .select({ sessionId: ticketPayments.checkoutSessionId, method: ticketPayments.method })
      .from(ticketPayments)
      .where(inArray(ticketPayments.checkoutSessionId, sessionIds));
    for (const p of payRows) {
      const existing = sessionPayments.get(p.sessionId) ?? [];
      if (!existing.includes(p.method)) existing.push(p.method);
      sessionPayments.set(p.sessionId, existing);
    }
  }

  // Group rows by ticket (multiple items per ticket)
  type TicketAgg = {
    id: string;
    clientName: string;
    employeeName: string;
    firstService: string;
    firstVariant: string;
    total: number;
    closedAt: Date | null;
    closedBy: string | null;
    sessionId: string | null;
    hasOverride: boolean;
  };
  const ticketMap = new Map<string, TicketAgg>();

  for (const r of rows) {
    const effectivePrice = r.overridePrice ?? r.unitPrice;
    if (!ticketMap.has(r.id)) {
      ticketMap.set(r.id, {
        id: r.id,
        clientName: r.clientName ?? r.guestName ?? "—",
        employeeName: r.employeeName,
        firstService: r.serviceName,
        firstVariant: r.variantName,
        total: 0,
        closedAt: r.closedAt,
        closedBy: r.closedBy,
        sessionId: r.checkoutSessionId,
        hasOverride: false,
      });
    }
    const t = ticketMap.get(r.id)!;
    t.total += effectivePrice * r.quantity;
    if (r.overridePrice !== null) t.hasOverride = true;
  }

  const result: ClosedTicketRow[] = Array.from(ticketMap.values()).map((t) => ({
    id: t.id,
    clientName: t.clientName,
    employeeName: t.employeeName,
    serviceSummary: `${t.firstService} — ${t.firstVariant}`,
    total: t.total,
    paymentMethods: t.sessionId ? (sessionPayments.get(t.sessionId) ?? []) : [],
    closedAt: t.closedAt,
    closedByName: t.closedBy ? (closerNames.get(t.closedBy) ?? "—") : "—",
    hasOverride: t.hasOverride,
  }));

  return { success: true, data: result };
}

// ─── Get closed ticket detail ─────────────────────────────────────────────────

export async function getClosedTicketDetail(
  ticketId: string,
): Promise<ActionResult<ClosedTicketDetail>> {
  const guard = await requireAdminOrCashier();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code!,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();

  const itemRows = await db
    .select({
      ticketId: tickets.id,
      clientName: clients.name,
      guestName: tickets.guestName,
      employeeName: users.name,
      closedAt: tickets.closedAt,
      closedBy: tickets.closedBy,
      checkoutSessionId: tickets.checkoutSessionId,
      itemId: ticketItems.id,
      serviceName: services.name,
      variantName: serviceVariants.name,
      quantity: ticketItems.quantity,
      unitPrice: ticketItems.unitPrice,
      overridePrice: ticketItems.overridePrice,
      overrideReason: ticketItems.overrideReason,
    })
    .from(tickets)
    .leftJoin(clients, eq(tickets.clientId, clients.id))
    .innerJoin(employees, eq(tickets.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .where(and(eq(tickets.id, ticketId), eq(tickets.status, "closed")));

  if (itemRows.length === 0)
    return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };

  const first = itemRows[0];

  // Resolve closedBy name
  let closedByName = "—";
  if (first.closedBy) {
    const [closer] = await db
      .select({ name: users.name })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(eq(employees.id, first.closedBy))
      .limit(1);
    if (closer) closedByName = closer.name;
  }

  // Fetch payments
  let payments: ClosedTicketPayment[] = [];
  if (first.checkoutSessionId) {
    payments = await db
      .select({ method: ticketPayments.method, amount: ticketPayments.amount })
      .from(ticketPayments)
      .where(eq(ticketPayments.checkoutSessionId, first.checkoutSessionId));
  }

  const lineItems: ClosedTicketLineItem[] = itemRows.map((r) => ({
    id: r.itemId,
    serviceName: r.serviceName,
    variantName: r.variantName,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    overridePrice: r.overridePrice,
    overrideReason: r.overrideReason,
    effectivePrice: r.overridePrice ?? r.unitPrice,
  }));

  const total = lineItems.reduce((sum, item) => sum + item.effectivePrice * item.quantity, 0);

  return {
    success: true,
    data: {
      id: first.ticketId,
      clientName: first.clientName ?? first.guestName ?? "—",
      employeeName: first.employeeName,
      closedAt: first.closedAt,
      closedByName,
      lineItems,
      payments,
      total,
    },
  };
}

// ─── Reopen a closed ticket ───────────────────────────────────────────────────

/**
 * reopenTicket — T042
 *
 * Transitions a closed ticket back to `reopened`.
 * - Detaches the ticket from its checkout_session (set to null).
 * - If the session still has other closed tickets, marks it `is_partially_reopened`.
 * - Fires a `ticket_updated` SSE event so the cashier dashboard updates live.
 * - Payout `needs_review` flag is a stub — payouts table is created in Phase 7 (T066).
 */
export async function reopenTicket(rawTicketId: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = transitionTicketSchema.safeParse({ ticketId: rawTicketId });
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const ticketId = parsed.data.ticketId;

  const guard = await requireAdminOrCashier();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code!,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

  const db = getDb();

  // Fetch current ticket state
  const [ticket] = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      version: tickets.version,
      checkoutSessionId: tickets.checkoutSessionId,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!ticket)
    return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };

  if (ticket.status !== "closed")
    return {
      success: false,
      error: { code: "CONFLICT", message: "Solo se pueden reabrir tickets cerrados" },
    };

  // Transition ticket: closed → reopened, detach from checkout session, bump version
  const [updated] = await db
    .update(tickets)
    .set({
      status: "reopened",
      checkoutSessionId: null,
      closedAt: null,
      closedBy: null,
      version: ticket.version + 1,
    })
    .where(and(eq(tickets.id, ticketId), eq(tickets.version, ticket.version)))
    .returning({ id: tickets.id, status: tickets.status });

  if (!updated)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El ticket fue modificado por otra sesión" },
    };

  // If there was a checkout session, check if other closed tickets remain in it.
  // If so, mark it partially_reopened so cashier knows.
  if (ticket.checkoutSessionId) {
    const [sibling] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(
        and(
          eq(tickets.checkoutSessionId, ticket.checkoutSessionId),
          eq(tickets.status, "closed"),
          ne(tickets.id, ticketId),
        ),
      )
      .limit(1);

    if (sibling) {
      await db
        .update(checkoutSessions)
        .set({ isPartiallyReopened: true })
        .where(eq(checkoutSessions.id, ticket.checkoutSessionId));
    }
  }

  // NOTE (T066 stub): When the payouts table is created in Phase 7,
  // any payout record whose period includes this ticket's closed_at date
  // should be flagged `needs_review = true` here.

  publishEvent("cashier", "ticket_updated", { ticketId: updated.id, status: updated.status });
  revalidatePath("/cashier");
  revalidatePath("/cashier/tickets/history");
  revalidatePath("/admin/tickets/history");

  return { success: true, data: { id: updated.id } };
}
