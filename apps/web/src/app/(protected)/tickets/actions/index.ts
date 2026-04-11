"use server";

/**
 * Ticket server actions — T035
 *
 * createTicket: stylist (own), secretary/cashier_admin (any stylist).
 * listActiveStylists: secretary/cashier_admin only — used to populate employee selector.
 */

import { headers } from "next/headers";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  tickets,
  ticketItems,
  employees,
  users,
  serviceVariants,
  clients,
  services,
} from "@befine/db/schema";
import { createTicketSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import { publishEvent } from "@befine/realtime/server";

export type TicketRow = {
  id: string;
  businessDayId: string;
  employeeId: string;
  employeeName: string;
  clientId: string | null;
  guestName: string | null;
  status: "logged" | "awaiting_payment" | "closed" | "reopened" | "paid_offline";
  idempotencyKey: string | null;
  createdAt: Date;
};

export type StylistOption = {
  id: string;
  name: string;
  role: string;
  stylistSubtype: string | null;
};

// ─── Get current employee ID ──────────────────────────────────────────────────

export async function getCurrentEmployeeId(): Promise<ActionResult<{ employeeId: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  return { success: true, data: { employeeId: emp.id } };
}

// ─── List active stylists (secretary / cashier_admin) ─────────────────────────

export async function listActiveStylists(): Promise<ActionResult<StylistOption[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const rows = await db
    .select({
      id: employees.id,
      name: users.name,
      role: employees.role,
      stylistSubtype: employees.stylistSubtype,
    })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(eq(employees.isActive, true), eq(employees.role, "stylist")))
    .orderBy(users.name);

  return { success: true, data: rows };
}

// ─── Create ticket ────────────────────────────────────────────────────────────

export async function createTicket(rawInput: unknown): Promise<ActionResult<TicketRow>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const isStylist = hasRole(session.user, "stylist");
  const isStaff = hasRole(session.user, "cashier_admin", "secretary");
  if (!isStylist && !isStaff)
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const parsed = createTicketSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Por favor corrige los errores en el formulario.",
        details: parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    };

  const input = parsed.data;

  // Stylists can only create tickets for themselves
  if (isStylist && !isStaff) {
    const db = getDb();
    const emp = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.userId, session.user.id))
      .limit(1);
    if (!emp[0] || emp[0].id !== input.employeeId)
      return {
        success: false,
        error: { code: "FORBIDDEN", message: "Solo puedes crear tickets para ti mismo" },
      };
  }

  // Require open business day
  const businessDay = await getCurrentBusinessDay();
  if (!businessDay)
    return {
      success: false,
      error: { code: "CONFLICT", message: "No hay un día laboral abierto" },
    };

  const db = getDb();

  // Fetch variant to snapshot price/commission
  const [variant] = await db
    .select({
      customerPrice: serviceVariants.customerPrice,
      commissionPct: serviceVariants.commissionPct,
      isActive: serviceVariants.isActive,
    })
    .from(serviceVariants)
    .where(eq(serviceVariants.id, input.serviceVariantId))
    .limit(1);

  if (!variant || !variant.isActive)
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Servicio no encontrado o inactivo" },
    };

  // Get the employee's userId for createdBy
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  const createdByEmployeeId = emp?.id ?? input.employeeId;

  // Insert ticket + item atomically
  try {
    const result = await db.transaction(async (tx) => {
      // Idempotency: return existing ticket if key already used
      const existing = await tx
        .select()
        .from(tickets)
        .where(eq(tickets.idempotencyKey, input.idempotencyKey))
        .limit(1);

      if (existing[0]) {
        const [empUser] = await tx
          .select({ name: users.name })
          .from(employees)
          .innerJoin(users, eq(employees.userId, users.id))
          .where(eq(employees.id, existing[0].employeeId))
          .limit(1);
        return { ticket: existing[0], employeeName: empUser?.name ?? "" };
      }

      const [newTicket] = await tx
        .insert(tickets)
        .values({
          businessDayId: businessDay.id,
          employeeId: input.employeeId,
          clientId: input.clientType === "saved" ? (input.clientId ?? null) : null,
          guestName: input.clientType === "guest" ? (input.guestName ?? null) : null,
          idempotencyKey: input.idempotencyKey,
          createdBy: createdByEmployeeId,
        })
        .returning();

      await tx.insert(ticketItems).values({
        ticketId: newTicket.id,
        serviceVariantId: input.serviceVariantId,
        quantity: input.quantity,
        unitPrice: variant.customerPrice,
        commissionPct: variant.commissionPct,
      });

      const [empUser] = await tx
        .select({ name: users.name })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(eq(employees.id, input.employeeId))
        .limit(1);

      return { ticket: newTicket, employeeName: empUser?.name ?? "" };
    });

    publishEvent("cashier", "ticket_created", { ticketId: result.ticket.id });
    revalidatePath("/cashier");
    revalidatePath("/secretary");

    return {
      success: true,
      data: {
        id: result.ticket.id,
        businessDayId: result.ticket.businessDayId,
        employeeId: result.ticket.employeeId,
        employeeName: result.employeeName,
        clientId: result.ticket.clientId,
        guestName: result.ticket.guestName,
        status: result.ticket.status,
        idempotencyKey: result.ticket.idempotencyKey,
        createdAt: result.ticket.createdAt,
      },
    };
  } catch {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Error al crear el ticket" },
    };
  }
}

// ─── Open tickets for dashboard ───────────────────────────────────────────────

export type DashboardTicket = {
  id: string;
  employeeId: string;
  employeeName: string;
  clientName: string; // saved client name or guest name
  serviceName: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  status: "logged" | "awaiting_payment" | "closed" | "reopened" | "paid_offline";
  createdAt: Date;
};

export async function listOpenTickets(): Promise<ActionResult<DashboardTicket[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: [] };

  const db = getDb();

  const rows = await db
    .select({
      id: tickets.id,
      employeeId: tickets.employeeId,
      employeeName: users.name,
      clientId: tickets.clientId,
      clientName: clients.name,
      guestName: tickets.guestName,
      serviceName: services.name,
      variantName: serviceVariants.name,
      unitPrice: ticketItems.unitPrice,
      quantity: ticketItems.quantity,
      status: tickets.status,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .innerJoin(employees, eq(tickets.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .leftJoin(clients, eq(tickets.clientId, clients.id))
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
    .innerJoin(services, eq(serviceVariants.serviceId, services.id))
    .where(
      and(
        eq(tickets.businessDayId, businessDay.id),
        inArray(tickets.status, ["logged", "awaiting_payment", "reopened"]),
      ),
    )
    .orderBy(tickets.createdAt);

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      clientName: r.clientName ?? r.guestName ?? "—",
      serviceName: r.serviceName,
      variantName: r.variantName,
      unitPrice: r.unitPrice,
      quantity: r.quantity,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

// ─── Status transitions — T037 ────────────────────────────────────────────────

/**
 * Allowed transitions:
 *   logged → awaiting_payment   : stylist (own), secretary, cashier_admin
 *   awaiting_payment → closed   : cashier_admin only (T038)
 *   closed → reopened            : cashier_admin only
 *   reopened → awaiting_payment : cashier_admin only
 */
type TransitionInput = { ticketId: string };

async function getTicketAndEmployee(ticketId: string, userId: string) {
  const db = getDb();
  const [ticket] = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      employeeId: tickets.employeeId,
      version: tickets.version,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);

  return { ticket, employeeId: emp?.id };
}

export async function transitionToAwaitingPayment(
  rawInput: TransitionInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const isStylist = hasRole(session.user, "stylist");
  const isStaff = hasRole(session.user, "cashier_admin", "secretary");
  if (!isStylist && !isStaff)
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const { ticket, employeeId } = await getTicketAndEmployee(rawInput.ticketId, session.user.id);
  if (!ticket)
    return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };

  if (ticket.status !== "logged")
    return { success: false, error: { code: "CONFLICT", message: "Transición no permitida" } };

  // Stylists can only transition their own tickets
  if (isStylist && !isStaff && ticket.employeeId !== employeeId)
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Solo puedes modificar tus propios tickets" },
    };

  const db = getDb();
  const [updated] = await db
    .update(tickets)
    .set({ status: "awaiting_payment", version: ticket.version + 1 })
    .where(and(eq(tickets.id, rawInput.ticketId), eq(tickets.version, ticket.version)))
    .returning({ id: tickets.id, status: tickets.status });

  if (!updated)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El ticket fue modificado por otra sesión" },
    };

  publishEvent("cashier", "ticket_updated", { ticketId: updated.id, status: updated.status });
  revalidatePath("/cashier");
  revalidatePath("/secretary");

  return { success: true, data: { id: updated.id, status: updated.status } };
}

export async function transitionToReopened(
  rawInput: TransitionInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const { ticket } = await getTicketAndEmployee(rawInput.ticketId, session.user.id);
  if (!ticket)
    return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };

  if (ticket.status !== "closed")
    return {
      success: false,
      error: { code: "CONFLICT", message: "Solo se puede reabrir un ticket cerrado" },
    };

  const db = getDb();
  const [updated] = await db
    .update(tickets)
    .set({ status: "reopened", closedAt: null, version: ticket.version + 1 })
    .where(and(eq(tickets.id, rawInput.ticketId), eq(tickets.version, ticket.version)))
    .returning({ id: tickets.id, status: tickets.status });

  if (!updated)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El ticket fue modificado por otra sesión" },
    };

  publishEvent("cashier", "ticket_updated", { ticketId: updated.id, status: updated.status });
  revalidatePath("/cashier");

  return { success: true, data: { id: updated.id, status: updated.status } };
}

export async function transitionReopenedToAwaitingPayment(
  rawInput: TransitionInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const { ticket } = await getTicketAndEmployee(rawInput.ticketId, session.user.id);
  if (!ticket)
    return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };

  if (ticket.status !== "reopened")
    return { success: false, error: { code: "CONFLICT", message: "Transición no permitida" } };

  const db = getDb();
  const [updated] = await db
    .update(tickets)
    .set({ status: "awaiting_payment", version: ticket.version + 1 })
    .where(and(eq(tickets.id, rawInput.ticketId), eq(tickets.version, ticket.version)))
    .returning({ id: tickets.id, status: tickets.status });

  if (!updated)
    return {
      success: false,
      error: { code: "STALE_DATA", message: "El ticket fue modificado por otra sesión" },
    };

  publishEvent("cashier", "ticket_updated", { ticketId: updated.id, status: updated.status });
  revalidatePath("/cashier");

  return { success: true, data: { id: updated.id, status: updated.status } };
}
