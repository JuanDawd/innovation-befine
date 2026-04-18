"use server";

/**
 * Ticket edit request actions — T041
 *
 * requestEdit:              secretary / stylist — submit a request to change a ticket item's variant
 * listPendingEditRequests:  cashier_admin — list all open requests for today's business day
 * resolveEditRequest:       cashier_admin — approve (updates item) or reject (no change)
 * listMyEditRequests:       secretary / stylist — list their own open requests on today's tickets
 */

import { headers } from "next/headers";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  ticketEditRequests,
  ticketItems,
  tickets,
  employees,
  users,
  services,
  serviceVariants,
} from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { createNotification } from "@/lib/notifications";
import { publishEvent } from "@befine/realtime/server";
import { revalidatePath } from "next/cache";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { requestEditSchema, resolveEditRequestSchema } from "@befine/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingEditRequest = {
  id: string;
  ticketItemId: string;
  ticketId: string;
  clientName: string;
  employeeName: string;
  currentVariantName: string;
  currentServiceName: string;
  newVariantName: string;
  newServiceName: string;
  requestedByName: string;
  createdAt: Date;
};

export type MyEditRequest = {
  id: string;
  ticketItemId: string;
  ticketId: string;
  clientName: string;
  currentVariantName: string;
  currentServiceName: string;
  newVariantName: string;
  newServiceName: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getSessionAndEmployee() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!emp) return null;
  return { session, employeeId: emp.id };
}

// ─── Request edit (secretary / stylist) ──────────────────────────────────────

export async function requestEdit(
  rawTicketItemId: unknown,
  rawNewServiceVariantId: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = requestEditSchema.safeParse({
    ticketItemId: rawTicketItemId,
    newServiceVariantId: rawNewServiceVariantId,
  });
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const { ticketItemId, newServiceVariantId } = parsed.data;

  const ctx = await getSessionAndEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const { session, employeeId } = ctx;
  if (!hasRole(session.user, "secretary", "stylist"))
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

  const db = getDb();

  // Verify the ticket item exists and belongs to an open ticket
  const [item] = await db
    .select({
      id: ticketItems.id,
      ticketId: ticketItems.ticketId,
      serviceVariantId: ticketItems.serviceVariantId,
      ticketStatus: tickets.status,
      ticketEmployeeId: tickets.employeeId,
    })
    .from(ticketItems)
    .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
    .where(eq(ticketItems.id, ticketItemId))
    .limit(1);

  if (!item) return { success: false, error: { code: "NOT_FOUND", message: "Ítem no encontrado" } };

  // Only logged/awaiting_payment tickets can be edit-requested
  if (!["logged", "awaiting_payment", "reopened"].includes(item.ticketStatus))
    return {
      success: false,
      error: { code: "CONFLICT", message: "El ticket no se puede editar en su estado actual" },
    };

  // Stylists can only request edits on their own tickets
  if (hasRole(session.user, "stylist") && item.ticketEmployeeId !== employeeId)
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Solo puedes editar tus propios tickets" },
    };

  // Must be a different variant
  if (item.serviceVariantId === newServiceVariantId)
    return {
      success: false,
      error: { code: "CONFLICT", message: "El servicio seleccionado es el mismo" },
    };

  // No duplicate pending request for the same item
  const [existing] = await db
    .select({ id: ticketEditRequests.id })
    .from(ticketEditRequests)
    .where(
      and(
        eq(ticketEditRequests.ticketItemId, ticketItemId),
        eq(ticketEditRequests.status, "pending"),
      ),
    )
    .limit(1);

  if (existing)
    return {
      success: false,
      error: { code: "CONFLICT", message: "Ya hay una solicitud pendiente para este ítem" },
    };

  // Verify new variant is active
  const [newVariant] = await db
    .select({ isActive: serviceVariants.isActive })
    .from(serviceVariants)
    .where(eq(serviceVariants.id, newServiceVariantId))
    .limit(1);

  if (!newVariant?.isActive)
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Variante no encontrada o inactiva" },
    };

  const [req] = await db
    .insert(ticketEditRequests)
    .values({
      ticketItemId,
      requestedBy: employeeId,
      newServiceVariantId,
    })
    .returning({ id: ticketEditRequests.id });

  // Fire SSE so cashier dashboard badge updates
  publishEvent("cashier", "ticket_updated", { ticketId: item.ticketId, status: "edit_requested" });
  revalidatePath("/cashier");

  return { success: true, data: { id: req.id } };
}

// ─── List pending edit requests (cashier) ────────────────────────────────────

export async function listPendingEditRequests(): Promise<ActionResult<PendingEditRequest[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();

  // Fetch and join in JS for the aliased self-join on service_variants
  const rows = await db
    .select({
      id: ticketEditRequests.id,
      ticketItemId: ticketEditRequests.ticketItemId,
      ticketId: tickets.id,
      clientName: tickets.guestName, // resolved below
      employeeId: tickets.employeeId,
      requestedBy: ticketEditRequests.requestedBy,
      currentVariantId: ticketItems.serviceVariantId,
      newVariantId: ticketEditRequests.newServiceVariantId,
      createdAt: ticketEditRequests.createdAt,
    })
    .from(ticketEditRequests)
    .innerJoin(ticketItems, eq(ticketEditRequests.ticketItemId, ticketItems.id))
    .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
    .where(and(eq(ticketEditRequests.status, "pending"), eq(tickets.businessDayId, businessDay.id)))
    .orderBy(ticketEditRequests.createdAt);

  if (rows.length === 0) return { success: true, data: [] };

  // Batch-resolve names
  const variantIds = [
    ...new Set([...rows.map((r) => r.currentVariantId), ...rows.map((r) => r.newVariantId)]),
  ];
  const employeeIds = [
    ...new Set([...rows.map((r) => r.employeeId), ...rows.map((r) => r.requestedBy)]),
  ];
  const ticketIds = [...new Set(rows.map((r) => r.ticketId))];

  const [variantRows, employeeRows, clientRows] = await Promise.all([
    db
      .select({
        id: serviceVariants.id,
        name: serviceVariants.name,
        serviceName: services.name,
      })
      .from(serviceVariants)
      .innerJoin(services, eq(serviceVariants.serviceId, services.id))
      .where(inArray(serviceVariants.id, variantIds)),
    db
      .select({ id: employees.id, name: users.name })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(inArray(employees.id, employeeIds)),
    db
      .select({ id: tickets.id, clientId: tickets.clientId, guestName: tickets.guestName })
      .from(tickets)
      .where(inArray(tickets.id, ticketIds)),
  ]);

  // Resolve saved client names
  const savedClientIds = clientRows.map((r) => r.clientId).filter(Boolean) as string[];
  const clientNameMap = new Map<string, string>();
  if (savedClientIds.length > 0) {
    const { clients } = await import("@befine/db/schema");
    const clientNameRows = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(inArray(clients.id, savedClientIds));
    clientNameRows.forEach((c) => clientNameMap.set(c.id, c.name));
  }

  const variantMap = new Map(variantRows.map((v) => [v.id, v]));
  const employeeMap = new Map(employeeRows.map((e) => [e.id, e.name]));
  const ticketClientMap = new Map(
    clientRows.map((t) => [
      t.id,
      t.clientId ? (clientNameMap.get(t.clientId) ?? "—") : (t.guestName ?? "—"),
    ]),
  );

  const result: PendingEditRequest[] = rows.map((r) => ({
    id: r.id,
    ticketItemId: r.ticketItemId,
    ticketId: r.ticketId,
    clientName: ticketClientMap.get(r.ticketId) ?? "—",
    employeeName: employeeMap.get(r.employeeId) ?? "—",
    currentServiceName: variantMap.get(r.currentVariantId)?.serviceName ?? "—",
    currentVariantName: variantMap.get(r.currentVariantId)?.name ?? "—",
    newServiceName: variantMap.get(r.newVariantId)?.serviceName ?? "—",
    newVariantName: variantMap.get(r.newVariantId)?.name ?? "—",
    requestedByName: employeeMap.get(r.requestedBy) ?? "—",
    createdAt: r.createdAt,
  }));

  return { success: true, data: result };
}

// ─── Resolve (cashier: approve or reject) ────────────────────────────────────

export async function resolveEditRequest(
  rawRequestId: unknown,
  rawDecision: unknown,
): Promise<ActionResult<void>> {
  const parsed = resolveEditRequestSchema.safeParse({
    requestId: rawRequestId,
    decision: rawDecision,
  });
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const { requestId, decision } = parsed.data;

  const ctx = await getSessionAndEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const { session, employeeId: cashierId } = ctx;
  if (!hasRole(session.user, "cashier_admin"))
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

  const db = getDb();

  // Fetch the request with item details (pre-transaction read)
  const [req] = await db
    .select({
      id: ticketEditRequests.id,
      status: ticketEditRequests.status,
      ticketItemId: ticketEditRequests.ticketItemId,
      requestedBy: ticketEditRequests.requestedBy,
      newServiceVariantId: ticketEditRequests.newServiceVariantId,
    })
    .from(ticketEditRequests)
    .where(eq(ticketEditRequests.id, requestId))
    .limit(1);

  if (!req)
    return { success: false, error: { code: "NOT_FOUND", message: "Solicitud no encontrada" } };

  if (req.status !== "pending")
    return { success: false, error: { code: "CONFLICT", message: "La solicitud ya fue resuelta" } };

  const now = new Date();

  // Fetch ticketId for SSE/notification (needed post-commit)
  const [ticketRow] = await db
    .select({ ticketId: ticketItems.ticketId })
    .from(ticketItems)
    .where(eq(ticketItems.id, req.ticketItemId))
    .limit(1);
  const ticketId = ticketRow?.ticketId;

  // ── Atomic: update ticket_items (if approved) + resolve the request ─────────
  try {
    await db.transaction(async (tx) => {
      if (decision === "approved") {
        const [newVariant] = await tx
          .select({
            customerPrice: serviceVariants.customerPrice,
            commissionPct: serviceVariants.commissionPct,
          })
          .from(serviceVariants)
          .where(eq(serviceVariants.id, req.newServiceVariantId))
          .limit(1);

        if (!newVariant) throw new Error("VARIANT_NOT_FOUND");

        await tx
          .update(ticketItems)
          .set({
            serviceVariantId: req.newServiceVariantId,
            unitPrice: newVariant.customerPrice,
            commissionPct: newVariant.commissionPct,
            overridePrice: null,
            overrideReason: null,
          })
          .where(eq(ticketItems.id, req.ticketItemId));
      }

      await tx
        .update(ticketEditRequests)
        .set({ status: decision, resolvedAt: now, resolvedBy: cashierId })
        .where(eq(ticketEditRequests.id, requestId));
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "VARIANT_NOT_FOUND")
      return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Error al resolver la solicitud" },
    };
  }

  // ── Post-commit: notify + SSE ────────────────────────────────────────────────
  await createNotification({
    recipientEmployeeId: req.requestedBy,
    type: decision === "approved" ? "edit_request_approved" : "edit_request_rejected",
    message:
      decision === "approved"
        ? "Tu solicitud de cambio fue aprobada"
        : "Tu solicitud de cambio fue rechazada",
    link: ticketId ? `/cashier/tickets/history` : undefined,
  });

  if (ticketId) {
    publishEvent("cashier", "ticket_updated", { ticketId, status: "edit_resolved" });
  }
  revalidatePath("/cashier");

  return { success: true, data: undefined };
}

// ─── Active variants for picker ──────────────────────────────────────────────

export type ActiveServiceVariant = {
  id: string;
  name: string;
  serviceName: string;
  customerPrice: number;
};

export async function listActiveServiceVariants(): Promise<ActionResult<ActiveServiceVariant[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "secretary", "stylist"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const rows = await db
    .select({
      id: serviceVariants.id,
      name: serviceVariants.name,
      serviceName: services.name,
      customerPrice: serviceVariants.customerPrice,
    })
    .from(serviceVariants)
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .where(and(eq(serviceVariants.isActive, true), eq(services.isActive, true)))
    .orderBy(services.name, serviceVariants.name);

  return { success: true, data: rows };
}

// ─── My open tickets with items (stylist / secretary) ────────────────────────

export type OpenTicketItem = {
  itemId: string;
  ticketId: string;
  ticketStatus: "logged" | "awaiting_payment" | "reopened";
  clientName: string;
  serviceVariantId: string;
  serviceName: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  hasPendingRequest: boolean;
};

export async function listMyOpenTicketItems(): Promise<ActionResult<OpenTicketItem[]>> {
  const ctx = await getSessionAndEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const { session, employeeId } = ctx;
  if (!hasRole(session.user, "secretary", "stylist"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();

  // For stylists: only their own tickets. For secretary: all tickets today.
  const isStylist = hasRole(session.user, "stylist");

  const rows = await db
    .select({
      itemId: ticketItems.id,
      ticketId: tickets.id,
      ticketStatus: tickets.status,
      guestName: tickets.guestName,
      clientId: tickets.clientId,
      serviceVariantId: ticketItems.serviceVariantId,
      serviceName: services.name,
      variantName: serviceVariants.name,
      unitPrice: ticketItems.unitPrice,
      quantity: ticketItems.quantity,
    })
    .from(ticketItems)
    .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .where(
      and(
        eq(tickets.businessDayId, businessDay.id),
        inArray(tickets.status, ["logged", "awaiting_payment", "reopened"]),
        isStylist ? eq(tickets.employeeId, employeeId) : undefined,
      ),
    )
    .orderBy(tickets.createdAt, ticketItems.createdAt);

  if (rows.length === 0) return { success: true, data: [] };

  // Check which items have a pending request
  const itemIds = rows.map((r) => r.itemId);
  const pendingRows = await db
    .select({ ticketItemId: ticketEditRequests.ticketItemId })
    .from(ticketEditRequests)
    .where(
      and(
        inArray(ticketEditRequests.ticketItemId, itemIds),
        eq(ticketEditRequests.status, "pending"),
      ),
    );
  const pendingSet = new Set(pendingRows.map((p) => p.ticketItemId));

  // Resolve saved client names
  const savedClientIds = rows.map((r) => r.clientId).filter(Boolean) as string[];
  const clientNameMap = new Map<string, string>();
  if (savedClientIds.length > 0) {
    const { clients } = await import("@befine/db/schema");
    const clientNameRows = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(inArray(clients.id, savedClientIds));
    clientNameRows.forEach((c) => clientNameMap.set(c.id, c.name));
  }

  return {
    success: true,
    data: rows.map((r) => ({
      itemId: r.itemId,
      ticketId: r.ticketId,
      ticketStatus: r.ticketStatus as OpenTicketItem["ticketStatus"],
      clientName: r.clientId ? (clientNameMap.get(r.clientId) ?? "—") : (r.guestName ?? "—"),
      serviceVariantId: r.serviceVariantId,
      serviceName: r.serviceName,
      variantName: r.variantName,
      unitPrice: r.unitPrice,
      quantity: r.quantity,
      hasPendingRequest: pendingSet.has(r.itemId),
    })),
  };
}

// ─── My open edit requests (stylist / secretary) ──────────────────────────────

export async function listMyEditRequests(): Promise<ActionResult<MyEditRequest[]>> {
  const ctx = await getSessionAndEmployee();
  if (!ctx) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const { session, employeeId } = ctx;
  if (!hasRole(session.user, "secretary", "stylist"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();

  const rows = await db
    .select({
      id: ticketEditRequests.id,
      ticketItemId: ticketEditRequests.ticketItemId,
      ticketId: tickets.id,
      guestName: tickets.guestName,
      clientId: tickets.clientId,
      currentVariantId: ticketItems.serviceVariantId,
      newVariantId: ticketEditRequests.newServiceVariantId,
      status: ticketEditRequests.status,
      createdAt: ticketEditRequests.createdAt,
    })
    .from(ticketEditRequests)
    .innerJoin(ticketItems, eq(ticketEditRequests.ticketItemId, ticketItems.id))
    .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
    .where(
      and(
        eq(ticketEditRequests.requestedBy, employeeId),
        eq(tickets.businessDayId, businessDay.id),
      ),
    )
    .orderBy(ticketEditRequests.createdAt);

  if (rows.length === 0) return { success: true, data: [] };

  const variantIds = [
    ...new Set([...rows.map((r) => r.currentVariantId), ...rows.map((r) => r.newVariantId)]),
  ];
  const variantRows = await db
    .select({ id: serviceVariants.id, name: serviceVariants.name, serviceName: services.name })
    .from(serviceVariants)
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .where(inArray(serviceVariants.id, variantIds));

  const savedClientIds = rows.map((r) => r.clientId).filter(Boolean) as string[];
  const clientNameMap = new Map<string, string>();
  if (savedClientIds.length > 0) {
    const { clients } = await import("@befine/db/schema");
    const clientNameRows = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(inArray(clients.id, savedClientIds));
    clientNameRows.forEach((c) => clientNameMap.set(c.id, c.name));
  }

  const variantMap = new Map(variantRows.map((v) => [v.id, v]));

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      ticketItemId: r.ticketItemId,
      ticketId: r.ticketId,
      clientName: r.clientId ? (clientNameMap.get(r.clientId) ?? "—") : (r.guestName ?? "—"),
      currentServiceName: variantMap.get(r.currentVariantId)?.serviceName ?? "—",
      currentVariantName: variantMap.get(r.currentVariantId)?.name ?? "—",
      newServiceName: variantMap.get(r.newVariantId)?.serviceName ?? "—",
      newVariantName: variantMap.get(r.newVariantId)?.name ?? "—",
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}
