"use server";

/**
 * Ticket server actions — T035
 *
 * createTicket: stylist (own), secretary/cashier/admin (any stylist).
 * listActiveStylists: secretary/cashier/admin only — used to populate employee selector.
 */

import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  tickets,
  ticketItems,
  employees,
  users,
  serviceVariants,
  clients,
  services,
} from "@befine/db/schema";
import { createTicketSchema, transitionTicketSchema, voidTicketSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import { publishEvent } from "@befine/realtime/server";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { getEmployeeRef } from "@/lib/employee-ref";

export type TicketRow = {
  id: string;
  businessDayId: string;
  employeeId: string;
  employeeName: string;
  clientId: string | null;
  guestName: string | null;
  status: "logged" | "awaiting_payment" | "closed" | "reopened" | "paid_offline" | "voided";
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

  const emp = await getEmployeeRef(session.user.id);

  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  return { success: true, data: { employeeId: emp.id } };
}

// ─── List active stylists (secretary / cashier / admin) ───────────────────────

export async function listActiveStylists(): Promise<ActionResult<StylistOption[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier", "admin", "secretary"))
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
  const isStaff = hasRole(session.user, "cashier", "admin", "secretary");
  if (!isStylist && !isStaff)
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const rl = await checkRateLimit(rateLimits.ticketCreate, session.user.id);
  if (!rl.allowed)
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      },
    };

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
    const emp = await getEmployeeRef(session.user.id);
    if (!emp || emp.id !== input.employeeId)
      return {
        success: false,
        error: { code: "FORBIDDEN", message: "Solo puedes crear tickets para ti mismo" },
      };
  }

  // M-62: these lookups are independent — one round trip instead of three.
  const db = getDb();
  const [businessDay, [variant], emp] = await Promise.all([
    getCurrentBusinessDay(),
    // Snapshot price/commission from the variant
    db
      .select({
        customerPrice: serviceVariants.customerPrice,
        commissionPct: serviceVariants.commissionPct,
        isActive: serviceVariants.isActive,
      })
      .from(serviceVariants)
      .where(eq(serviceVariants.id, input.serviceVariantId))
      .limit(1),
    // The creator's employee id for createdBy
    getEmployeeRef(session.user.id),
  ]);

  if (!businessDay)
    return {
      success: false,
      error: { code: "CONFLICT", message: "No hay un día laboral abierto" },
    };

  if (!variant || !variant.isActive)
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Servicio no encontrado o inactivo" },
    };

  const createdByEmployeeId = emp?.id ?? input.employeeId;

  // Insert ticket + item atomically
  const txDb = getTxDb();
  try {
    const result = await txDb.transaction(async (tx) => {
      // Idempotency (L-47): insert-or-nothing on the unique key. A concurrent
      // retry with the same key waits on the first insert and then does
      // nothing, instead of failing on the unique constraint.
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
        .onConflictDoNothing({ target: tickets.idempotencyKey })
        .returning();

      if (!newTicket) {
        const [existing] = await tx
          .select()
          .from(tickets)
          .where(eq(tickets.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (!existing) throw new Error("Idempotency key conflict but no ticket found");
        const [empUser] = await tx
          .select({ name: users.name })
          .from(employees)
          .innerJoin(users, eq(employees.userId, users.id))
          .where(eq(employees.id, existing.employeeId))
          .limit(1);
        return { ticket: existing, employeeName: empUser?.name ?? "" };
      }

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
  } catch (err) {
    // M-61: keep the generic message for the user, but never lose the cause.
    logger.error(
      { err, action: "createTicket", businessDayId: businessDay.id, employeeId: input.employeeId },
      "createTicket failed",
    );
    Sentry.captureException(err, {
      tags: { action: "createTicket" },
      extra: { businessDayId: businessDay.id, idempotencyKey: input.idempotencyKey },
    });
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
  /** Cashier price adjustment — when set, it is what the client pays. */
  overridePrice: number | null;
  quantity: number;
  status: "logged" | "awaiting_payment" | "closed" | "reopened" | "paid_offline" | "voided";
  createdAt: Date;
};

export async function listOpenTickets(): Promise<ActionResult<DashboardTicket[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier", "admin", "secretary"))
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
      overridePrice: ticketItems.overridePrice,
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
      overridePrice: r.overridePrice,
      quantity: r.quantity,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

// ─── Status transitions — T037 ────────────────────────────────────────────────

/**
 * Allowed transitions:
 *   logged → awaiting_payment   : stylist (own), secretary, cashier, admin
 *   awaiting_payment → closed   : cashier/admin only (T038)
 *   closed → reopened            : cashier/admin only
 *   reopened → awaiting_payment : cashier/admin only
 *   logged | awaiting_payment → voided : cashier/admin only, reason required (H-49)
 */
type TransitionInput = { ticketId: string };

async function getTicketAndEmployee(ticketId: string, userId: string) {
  const db = getDb();
  // M-62: independent reads, one round trip.
  const [[ticket], emp] = await Promise.all([
    db
      .select({
        id: tickets.id,
        status: tickets.status,
        employeeId: tickets.employeeId,
        version: tickets.version,
      })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1),
    getEmployeeRef(userId),
  ]);

  return { ticket, employeeId: emp?.id };
}

export async function transitionToAwaitingPayment(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const parsedInput = transitionTicketSchema.safeParse(rawInput);
  if (!parsedInput.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const validInput: TransitionInput = { ticketId: parsedInput.data.ticketId };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const isStylist = hasRole(session.user, "stylist");
  const isStaff = hasRole(session.user, "cashier", "admin", "secretary");
  if (!isStylist && !isStaff)
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

  const { ticket, employeeId } = await getTicketAndEmployee(validInput.ticketId, session.user.id);
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
    .where(and(eq(tickets.id, validInput.ticketId), eq(tickets.version, ticket.version)))
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

export async function transitionReopenedToAwaitingPayment(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const parsedInput = transitionTicketSchema.safeParse(rawInput);
  if (!parsedInput.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const validInput: TransitionInput = { ticketId: parsedInput.data.ticketId };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier", "admin"))
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

  const { ticket } = await getTicketAndEmployee(validInput.ticketId, session.user.id);
  if (!ticket)
    return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };

  if (ticket.status !== "reopened")
    return { success: false, error: { code: "CONFLICT", message: "Transición no permitida" } };

  const db = getDb();
  const [updated] = await db
    .update(tickets)
    .set({ status: "awaiting_payment", version: ticket.version + 1 })
    .where(and(eq(tickets.id, validInput.ticketId), eq(tickets.version, ticket.version)))
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

/** Ticket statuses that can still be voided — nothing has been charged yet. */
const VOIDABLE_STATUSES = ["logged", "awaiting_payment"] as const;

export async function voidTicket(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const parsedInput = voidTicketSchema.safeParse(rawInput);
  if (!parsedInput.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Por favor corrige los errores en el formulario.",
        details: parsedInput.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    };
  const { ticketId, reason } = parsedInput.data;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier", "admin"))
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

  const { ticket, employeeId } = await getTicketAndEmployee(ticketId, session.user.id);
  if (!ticket)
    return { success: false, error: { code: "NOT_FOUND", message: "Ticket no encontrado" } };
  if (!employeeId) return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  if (!(VOIDABLE_STATUSES as readonly string[]).includes(ticket.status))
    return {
      success: false,
      error: { code: "CONFLICT", message: "Solo se pueden anular tickets sin cobrar" },
    };

  const db = getDb();
  const [updated] = await db
    .update(tickets)
    .set({
      status: "voided",
      voidedAt: new Date(),
      voidedBy: employeeId,
      voidReason: reason,
      version: ticket.version + 1,
    })
    .where(
      and(
        eq(tickets.id, ticketId),
        eq(tickets.version, ticket.version),
        inArray(tickets.status, [...VOIDABLE_STATUSES]),
      ),
    )
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
