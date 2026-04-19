"use server";

/**
 * Client server actions — T030, T032
 *
 * Search, create, edit, archive, and unarchive saved clients.
 * Accessible to cashier_admin and secretary roles.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, ilike, or, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { clients } from "@befine/db/schema";
import { createClientSchema, editClientSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";

const clientIdSchema = z.uuid();

export type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  noShowCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getClientSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (!hasRole(session.user, "cashier_admin", "secretary")) return null;
  return session;
}

// ─── Search clients (T030) ────────────────────────────────────────────────────

/**
 * Search active clients by name, phone, or email.
 * Returns up to 20 results. Used by the search widget in ticket/appointment creation.
 */
export async function searchClients(query: string): Promise<ActionResult<ClientRow[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const term = `%${query.trim()}%`;

  const rows = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.isActive, true),
        or(ilike(clients.name, term), ilike(clients.phone, term), ilike(clients.email, term)),
      ),
    )
    .limit(20)
    .orderBy(clients.name);

  return { success: true, data: rows };
}

// ─── List all clients (T030 — full management screen) ────────────────────────

export async function listClients(includeArchived = false): Promise<ActionResult<ClientRow[]>> {
  const session = await getClientSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(clients)
    .where(includeArchived ? undefined : eq(clients.isActive, true))
    .orderBy(clients.name);

  return { success: true, data: rows };
}

// ─── Create client (T030) ─────────────────────────────────────────────────────

export async function createClient(rawInput: unknown): Promise<ActionResult<ClientRow>> {
  const session = await getClientSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = createClientSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Por favor corrige los errores en el formulario.",
        details: parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    };
  }

  const { name, phone, email, notes } = parsed.data;
  const db = getDb();

  const [row] = await db
    .insert(clients)
    .values({
      name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
    })
    .returning();

  revalidatePath("/cashier/clients");
  revalidatePath("/secretary/clients");
  return { success: true, data: row };
}

// ─── Edit client (T030) ───────────────────────────────────────────────────────

export async function editClient(
  clientId: string,
  rawInput: unknown,
): Promise<ActionResult<ClientRow>> {
  if (!clientIdSchema.safeParse(clientId).success)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "ID de cliente inválido" },
    };

  const session = await getClientSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const parsed = editClientSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Por favor corrige los errores en el formulario.",
        details: parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    };
  }

  const { name, phone, email, notes } = parsed.data;
  const db = getDb();

  const [row] = await db
    .update(clients)
    .set({
      name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, clientId), eq(clients.isActive, true)))
    .returning();

  if (!row)
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Cliente no encontrado o archivado" },
    };

  revalidatePath("/cashier/clients");
  revalidatePath("/secretary/clients");
  return { success: true, data: row };
}

// ─── Archive client (T030) ────────────────────────────────────────────────────

export async function archiveClient(clientId: string): Promise<ActionResult<null>> {
  if (!clientIdSchema.safeParse(clientId).success)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "ID de cliente inválido" },
    };

  const session = await getClientSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const [row] = await db
    .update(clients)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.isActive, true)))
    .returning({ id: clients.id });

  if (!row)
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Cliente no encontrado o ya archivado" },
    };

  revalidatePath("/cashier/clients");
  revalidatePath("/secretary/clients");
  return { success: true, data: null };
}

// ─── Unarchive client (T030) ──────────────────────────────────────────────────

export async function unarchiveClient(clientId: string): Promise<ActionResult<null>> {
  if (!clientIdSchema.safeParse(clientId).success)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "ID de cliente inválido" },
    };

  const session = await getClientSession();
  if (!session) {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  }

  const db = getDb();
  const [row] = await db
    .update(clients)
    .set({ isActive: true, updatedAt: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.isActive, false)))
    .returning({ id: clients.id });

  if (!row)
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Cliente no encontrado o ya activo" },
    };

  revalidatePath("/cashier/clients");
  revalidatePath("/secretary/clients");
  return { success: true, data: null };
}
