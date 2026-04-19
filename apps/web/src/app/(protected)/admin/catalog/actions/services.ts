"use server";

/**
 * Service catalog server actions — T024, T109
 *
 * CRUD for services and service_variants.
 * Only cashier_admin can mutate; all authenticated roles can read (T028).
 * Every mutation writes to catalog_audit_log.
 * editVariant triggers price-change notifications to secretaries (T109).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, gt, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  services,
  serviceVariants,
  catalogAuditLog,
  appointments,
  employees,
} from "@befine/db/schema";
import { createNotification } from "@/lib/notifications";
import {
  createServiceSchema,
  editServiceSchema,
  editServiceVariantSchema,
  addVariantSchema,
} from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ServiceVariantRow = {
  id: string;
  serviceId: string;
  name: string;
  customerPrice: number;
  commissionPct: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  variants: ServiceVariantRow[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (!hasRole(session.user, "cashier_admin")) return null;
  return session;
}

async function getAuthSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
}

function writeAuditLog(
  db: ReturnType<typeof getDb>,
  params: {
    entityType: "service" | "service_variant" | "cloth_piece";
    entityId: string;
    action: "create" | "update" | "soft_delete" | "restore";
    changedBy: string;
    previousData?: unknown;
    newData?: unknown;
  },
) {
  return db.insert(catalogAuditLog).values({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    changedBy: params.changedBy,
    previousData: params.previousData ?? null,
    newData: params.newData ?? null,
  });
}

// ─── Read actions (T028) ─────────────────────────────────────────────────────

/**
 * List all active services with their active variants.
 * Available to all authenticated roles.
 */
export async function listActiveServices(): Promise<
  ActionResult<Omit<ServiceRow, "isActive" | "createdAt" | "updatedAt">[]>
> {
  const session = await getAuthSession();
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const db = getDb();
  const rows = await db.query.services.findMany({
    where: eq(services.isActive, true),
    with: {
      variants: {
        where: eq(serviceVariants.isActive, true),
        orderBy: (v, { asc }) => [asc(v.name)],
      },
    },
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  return { success: true, data: rows };
}

/**
 * List ALL services including inactive ones (admin-only).
 */
export async function listAllServices(): Promise<ActionResult<ServiceRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin")) {
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const rows = await db.query.services.findMany({
    with: {
      variants: {
        orderBy: (v, { asc }) => [asc(v.name)],
      },
    },
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  return { success: true, data: rows };
}

// ─── Create service ─────────────────────────────────────────────────────────

export async function createService(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = createServiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const db = getDb();
  const { name, description, variants } = parsed.data;

  const [service] = await db
    .insert(services)
    .values({ name, description: description ?? null })
    .returning({ id: services.id });

  await db.insert(serviceVariants).values(
    variants.map((v) => ({
      serviceId: service.id,
      name: v.name,
      customerPrice: v.customerPrice,
      commissionPct: v.commissionPct.toFixed(2),
    })),
  );

  await writeAuditLog(db, {
    entityType: "service",
    entityId: service.id,
    action: "create",
    changedBy: session.user.id,
    newData: { name, description, variants },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: { id: service.id } };
}

// ─── Edit service ────────────────────────────────────────────────────────────

export async function editService(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = editServiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const db = getDb();
  const existing = await db.query.services.findFirst({ where: eq(services.id, id) });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Servicio no encontrado" } };

  await db
    .update(services)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(services.id, id));

  await writeAuditLog(db, {
    entityType: "service",
    entityId: id,
    action: "update",
    changedBy: session.user.id,
    previousData: { name: existing.name, description: existing.description },
    newData: parsed.data,
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: { id } };
}

// ─── Soft-delete service ────────────────────────────────────────────────────

export async function deactivateService(id: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const existing = await db.query.services.findFirst({ where: eq(services.id, id) });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Servicio no encontrado" } };

  await db
    .update(services)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(services.id, id));

  await writeAuditLog(db, {
    entityType: "service",
    entityId: id,
    action: "soft_delete",
    changedBy: session.user.id,
    previousData: { isActive: true },
    newData: { isActive: false },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

// ─── Restore service ────────────────────────────────────────────────────────

export async function restoreService(id: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  await db
    .update(services)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(services.id, id));

  await writeAuditLog(db, {
    entityType: "service",
    entityId: id,
    action: "restore",
    changedBy: session.user.id,
    newData: { isActive: true },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

// ─── Add variant ─────────────────────────────────────────────────────────────

export async function addVariant(
  serviceId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = addVariantSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const db = getDb();
  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service)
    return { success: false, error: { code: "NOT_FOUND", message: "Servicio no encontrado" } };

  const [variant] = await db
    .insert(serviceVariants)
    .values({
      serviceId,
      name: parsed.data.name,
      customerPrice: parsed.data.customerPrice,
      commissionPct: parsed.data.commissionPct.toFixed(2),
    })
    .returning({ id: serviceVariants.id });

  await writeAuditLog(db, {
    entityType: "service_variant",
    entityId: variant.id,
    action: "create",
    changedBy: session.user.id,
    newData: { serviceId, ...parsed.data },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: { id: variant.id } };
}

// ─── Edit variant ─────────────────────────────────────────────────────────────

export async function editVariant(
  variantId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = editServiceVariantSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const db = getDb();
  const existing = await db.query.serviceVariants.findFirst({
    where: eq(serviceVariants.id, variantId),
  });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };

  const priceChanged =
    parsed.data.customerPrice !== existing.customerPrice ||
    parsed.data.commissionPct.toFixed(2) !== existing.commissionPct;

  await db
    .update(serviceVariants)
    .set({
      name: parsed.data.name,
      customerPrice: parsed.data.customerPrice,
      commissionPct: parsed.data.commissionPct.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(serviceVariants.id, variantId));

  await writeAuditLog(db, {
    entityType: "service_variant",
    entityId: variantId,
    action: "update",
    changedBy: session.user.id,
    previousData: {
      name: existing.name,
      customerPrice: existing.customerPrice,
      commissionPct: existing.commissionPct,
    },
    newData: parsed.data,
  });

  // T109: If price/commission changed, flag future appointments and notify secretaries
  if (priceChanged) {
    const now = new Date();

    // Find future booked/confirmed appointments for this variant (not yet acknowledged)
    const affected = await db
      .select({
        id: appointments.id,
        clientId: appointments.clientId,
        guestName: appointments.guestName,
        serviceSummary: appointments.serviceSummary,
        scheduledAt: appointments.scheduledAt,
        priceChangeAcknowledged: appointments.priceChangeAcknowledged,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.serviceVariantId, variantId),
          gt(appointments.scheduledAt, now),
          inArray(appointments.status, ["booked", "confirmed"]),
        ),
      );

    if (affected.length > 0) {
      // Reset price_change_acknowledged on all affected appointments
      await db
        .update(appointments)
        .set({ priceChangeAcknowledged: false, updatedAt: now })
        .where(
          and(
            eq(appointments.serviceVariantId, variantId),
            gt(appointments.scheduledAt, now),
            inArray(appointments.status, ["booked", "confirmed"]),
          ),
        );

      // Find all active secretary employees to notify
      const secretaries = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.role, "secretary"), eq(employees.isActive, true)));

      // Deduplicate: only notify for appointments that were previously acknowledged
      // (i.e. already-unacked appointments already have a pending notification — skip them)
      const toNotify = affected.filter((a) => a.priceChangeAcknowledged);

      for (const appt of toNotify) {
        const clientLabel = appt.guestName ?? `cliente`;
        const apptDate = new Date(appt.scheduledAt).toLocaleString("es-CO", {
          timeZone: "America/Bogota",
          dateStyle: "medium",
          timeStyle: "short",
        });
        const message = `Precio cambió para "${appt.serviceSummary}" — notifica a ${clientLabel} (cita: ${apptDate})`;

        for (const sec of secretaries) {
          await createNotification({
            recipientEmployeeId: sec.id,
            type: "price_changed",
            message,
            link: "/secretary/appointments",
          });
        }
      }
    }
  }

  revalidatePath("/admin/catalog");
  return { success: true, data: { id: variantId } };
}

// ─── Restore variant ─────────────────────────────────────────────────────────

export async function restoreVariant(variantId: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const existing = await db.query.serviceVariants.findFirst({
    where: eq(serviceVariants.id, variantId),
  });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };

  await db
    .update(serviceVariants)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(serviceVariants.id, variantId));

  await writeAuditLog(db, {
    entityType: "service_variant",
    entityId: variantId,
    action: "restore",
    changedBy: session.user.id,
    previousData: { isActive: false },
    newData: { isActive: true },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}

// ─── Soft-delete variant ──────────────────────────────────────────────────────

export async function deactivateVariant(variantId: string): Promise<ActionResult<null>> {
  const session = await getAdminSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const existing = await db.query.serviceVariants.findFirst({
    where: eq(serviceVariants.id, variantId),
  });
  if (!existing)
    return { success: false, error: { code: "NOT_FOUND", message: "Variante no encontrada" } };

  await db
    .update(serviceVariants)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(serviceVariants.id, variantId));

  await writeAuditLog(db, {
    entityType: "service_variant",
    entityId: variantId,
    action: "soft_delete",
    changedBy: session.user.id,
    previousData: { isActive: true },
    newData: { isActive: false },
  });

  revalidatePath("/admin/catalog");
  return { success: true, data: null };
}
