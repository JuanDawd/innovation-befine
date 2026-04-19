"use server";

/**
 * Appointment server actions — T050, T032b
 *
 * createAppointment: secretary and cashier_admin.
 * transitionAppointment: handles status transitions including no-show count
 *   increment/decrement (T032b) inside a DB transaction for atomicity.
 */

import { headers } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { appointments, employees, users, clients } from "@befine/db/schema";
import { createAppointmentSchema, transitionAppointmentSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

export type AppointmentRow = {
  id: string;
  clientId: string | null;
  guestName: string | null;
  stylistEmployeeId: string;
  serviceVariantId: string | null;
  serviceSummary: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: "booked" | "confirmed" | "completed" | "cancelled" | "rescheduled" | "no_show";
  createdAt: Date;
};

export type ConflictDetail = {
  scheduledAt: Date;
  durationMinutes: number;
};

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireBookingRole() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, code: "UNAUTHORIZED" as const, userId: null };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { ok: false as const, code: "FORBIDDEN" as const, userId: null };
  return { ok: true as const, code: null, userId: session.user.id };
}

// ─── Create appointment ───────────────────────────────────────────────────────

export async function createAppointment(
  rawInput: unknown,
): Promise<
  | ActionResult<AppointmentRow>
  | { success: false; error: { code: "CONFLICT"; message: string; conflict: ConflictDetail } }
> {
  const guard = await requireBookingRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
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

  const parsed = createAppointmentSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const input = parsed.data;
  const db = getDb();

  // Resolve creator employee id
  const [creatorEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, guard.userId!))
    .limit(1);
  if (!creatorEmp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  const scheduledAt = new Date(input.scheduledAt);
  const durationMinutes = input.durationMinutes;

  // Overlap check in TypeScript: fetch the stylist's non-terminal appointments,
  // then apply interval math in JS.
  // Avoids the Drizzle duplicate-instance sql-template issue (pre-existing in project).
  const newEnd = new Date(scheduledAt.getTime() + durationMinutes * 60_000);

  const stylistAppts = await db
    .select({
      scheduledAt: appointments.scheduledAt,
      durationMinutes: appointments.durationMinutes,
      status: appointments.status,
    })
    .from(appointments)
    .where(eq(appointments.stylistEmployeeId, input.stylistEmployeeId));

  const conflicts = stylistAppts.filter((a) => {
    if (a.status === "cancelled" || a.status === "no_show" || a.status === "rescheduled")
      return false;
    const aStart = new Date(a.scheduledAt);
    const aEnd = new Date(aStart.getTime() + a.durationMinutes * 60_000);
    return aStart < newEnd && aEnd > scheduledAt;
  });

  if (conflicts.length > 0) {
    const c = conflicts[0]!;
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: "El estilista ya tiene una cita en ese horario",
        conflict: { scheduledAt: c.scheduledAt, durationMinutes: c.durationMinutes },
      },
    };
  }

  // Insert appointment
  const [row] = await db
    .insert(appointments)
    .values({
      clientId: input.clientType === "saved" ? input.clientId : null,
      guestName: input.clientType === "guest" ? input.guestName : null,
      stylistEmployeeId: input.stylistEmployeeId,
      serviceVariantId: input.serviceVariantId ?? null,
      serviceSummary: input.serviceSummary,
      scheduledAt,
      durationMinutes,
      createdBy: creatorEmp.id,
    })
    .returning();

  if (!row)
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear la cita" } };

  // Notify the assigned stylist
  await createNotification({
    recipientEmployeeId: input.stylistEmployeeId,
    type: "appointment_reminder",
    message: `Nueva cita reservada: ${input.serviceSummary} — ${scheduledAt.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })}`,
    link: `/stylist`,
  });

  return {
    success: true,
    data: {
      id: row.id,
      clientId: row.clientId,
      guestName: row.guestName,
      stylistEmployeeId: row.stylistEmployeeId,
      serviceVariantId: row.serviceVariantId,
      serviceSummary: row.serviceSummary,
      scheduledAt: row.scheduledAt,
      durationMinutes: row.durationMinutes,
      status: row.status,
      createdAt: row.createdAt,
    },
  };
}

// ─── List appointments for a calendar date ───────────────────────────────────

export type AppointmentListRow = AppointmentRow & {
  clientName: string | null;
  stylistName: string;
};

/**
 * Returns all appointments for a given calendar date (America/Bogota),
 * optionally filtered by stylist. Date must be ISO date string "YYYY-MM-DD".
 */
export async function listAppointmentsForDate(
  rawDate: unknown,
  rawStylistId?: unknown,
): Promise<ActionResult<AppointmentListRow[]>> {
  const guard = await requireBookingRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  // Validate date param
  const dateStr = typeof rawDate === "string" ? rawDate : null;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Fecha inválida" } };

  const stylistId = typeof rawStylistId === "string" && rawStylistId ? rawStylistId : null;

  // Bogota is UTC-5; compute the UTC range for the given local date
  const dayStart = new Date(`${dateStr}T00:00:00-05:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999-05:00`);

  const db = getDb();

  // Fetch with optional stylist filter. Day-range and status filtering happen in JS
  // to avoid the Drizzle duplicate-instance sql-template issue (pre-existing in project).
  const baseQuery = db
    .select({
      id: appointments.id,
      clientId: appointments.clientId,
      guestName: appointments.guestName,
      clientName: clients.name,
      stylistEmployeeId: appointments.stylistEmployeeId,
      stylistName: users.name,
      serviceVariantId: appointments.serviceVariantId,
      serviceSummary: appointments.serviceSummary,
      scheduledAt: appointments.scheduledAt,
      durationMinutes: appointments.durationMinutes,
      status: appointments.status,
      createdAt: appointments.createdAt,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .innerJoin(employees, eq(appointments.stylistEmployeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id));

  const rows = stylistId
    ? await baseQuery
        .where(eq(appointments.stylistEmployeeId, stylistId))
        .orderBy(appointments.scheduledAt)
    : await baseQuery.orderBy(appointments.scheduledAt);

  // Filter by Bogota calendar day in JS
  const result = rows.filter((r) => {
    const t = new Date(r.scheduledAt);
    return t >= dayStart && t <= dayEnd;
  });

  return {
    success: true,
    data: result.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      guestName: r.guestName,
      clientName: r.clientName ?? null,
      stylistEmployeeId: r.stylistEmployeeId,
      stylistName: r.stylistName,
      serviceVariantId: r.serviceVariantId,
      serviceSummary: r.serviceSummary,
      scheduledAt: r.scheduledAt,
      durationMinutes: r.durationMinutes,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

// ─── List active stylists for booking form ────────────────────────────────────

export type StylistOption = {
  id: string;
  name: string;
  stylistSubtype: string | null;
};

export async function listBookingStylists(): Promise<ActionResult<StylistOption[]>> {
  const guard = await requireBookingRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const rows = await db
    .select({ id: employees.id, name: users.name, stylistSubtype: employees.stylistSubtype })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(eq(employees.isActive, true), eq(employees.role, "stylist")))
    .orderBy(users.name);

  return { success: true, data: rows };
}

// ─── Transition appointment status (T053) ────────────────────────────────────

/**
 * Valid transitions:
 *   booked    → confirmed | cancelled | no_show | completed
 *   confirmed → cancelled | no_show | completed
 *   (cancelled, no_show, completed, rescheduled are terminal — no further transitions)
 */
const ALLOWED_TRANSITIONS: Record<string, Record<string, string>> = {
  booked: { confirm: "confirmed", cancel: "cancelled", no_show: "no_show", complete: "completed" },
  confirmed: { cancel: "cancelled", no_show: "no_show", complete: "completed" },
  // T032b: no_show can be reversed back to booked (triggers decrement of no_show_count)
  no_show: { reopen: "booked" },
};

export async function transitionAppointment(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const guard = await requireBookingRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
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

  const parsed = transitionAppointmentSchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const { appointmentId, action, cancellationReason } = parsed.data;
  const db = getDb();

  const [appt] = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      clientId: appointments.clientId,
    })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!appt) return { success: false, error: { code: "NOT_FOUND", message: "Cita no encontrada" } };

  const transitions = ALLOWED_TRANSITIONS[appt.status];
  if (!transitions)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `La cita en estado "${appt.status}" no permite transiciones`,
      },
    };

  const newStatus = transitions[action];
  if (!newStatus)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `Acción "${action}" no permitida desde el estado "${appt.status}"`,
      },
    };

  const now = new Date();
  const statusValue = newStatus as (typeof appointments.$inferInsert)["status"];
  const previousStatus = appt.status;

  // Run inside a transaction: appointment update + optional no-show count delta (T032b)
  await db.transaction(async (tx) => {
    if (newStatus === "cancelled") {
      await tx
        .update(appointments)
        .set({
          status: statusValue,
          updatedAt: now,
          cancelledAt: now,
          cancellationReason: cancellationReason ?? null,
        })
        .where(eq(appointments.id, appointmentId));
    } else {
      await tx
        .update(appointments)
        .set({ status: statusValue, updatedAt: now })
        .where(eq(appointments.id, appointmentId));
    }

    // T032b — no-show count increment/decrement for saved clients only
    if (appt.clientId) {
      if (newStatus === "no_show" && previousStatus !== "no_show") {
        // Entering no-show: increment (idempotent — only when not already no_show)
        await tx
          .update(clients)
          .set({ noShowCount: sql`${clients.noShowCount} + 1`, updatedAt: now })
          .where(eq(clients.id, appt.clientId));
      } else if (previousStatus === "no_show" && newStatus !== "no_show") {
        // Reversing from no_show: decrement, floor at 0 (CHECK constraint enforces this)
        await tx
          .update(clients)
          .set({
            noShowCount: sql`GREATEST(${clients.noShowCount} - 1, 0)`,
            updatedAt: now,
          })
          .where(eq(clients.id, appt.clientId));
      }
    }
  });

  return { success: true, data: { id: appointmentId, status: newStatus } };
}
