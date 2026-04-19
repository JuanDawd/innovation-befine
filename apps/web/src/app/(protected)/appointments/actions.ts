"use server";

/**
 * Appointment server actions — T050
 *
 * createAppointment: secretary and cashier_admin.
 * Validates no overlapping appointment for the same stylist, then creates the
 * record and fires an in-app notification to the assigned stylist.
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { appointments, employees, users } from "@befine/db/schema";
import { createAppointmentSchema } from "@befine/types";
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
