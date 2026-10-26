"use server";

/**
 * Actividad and Historial — T132 (spec §3.9.28)
 *
 * getActivityPage      admin — timeline with filters (person, action type,
 *                      Bogotá date range, pedido number or client), keyset pages
 * getActivityPeople    admin — the person filter's options
 * getRecordHistory     the Historial of one record: pedido, ticket and client
 *                      for admin, cashier and secretary (the record they are
 *                      working on); employees for admin only. A client's
 *                      Historial includes its pedidos and tickets.
 */

import { headers } from "next/headers";
import { asc, ilike } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { clients, users } from "@befine/db/schema";
import {
  ACTIVITY_CATEGORIES,
  clientRecords,
  listActivity,
  pedidoRecordByNumber,
  type ActivityPage,
  type ActivityRecord,
} from "@befine/db";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";

const fail = (code: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION_ERROR", message: string) =>
  ({ success: false, error: { code, message } }) as const;

async function sessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).nullable().optional();

const pageSchema = z.object({
  actorUserId: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  category: z
    .enum(Object.keys(ACTIVITY_CATEGORIES) as [keyof typeof ACTIVITY_CATEGORIES])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  from: date,
  to: date,
  /** "#12", "12" → pedido number; anything else → client name */
  record: z.string().trim().max(100).optional(),
  cursor: cursorSchema,
});

export async function getActivityPage(rawInput: unknown): Promise<ActionResult<ActivityPage>> {
  const user = await sessionUser();
  if (!user) return fail("UNAUTHORIZED", "No autenticado");
  if (!hasRole(user, "admin")) return fail("FORBIDDEN", "Sin permisos");
  const parsed = pageSchema.safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Filtros inválidos");
  const { record, cursor, ...filters } = parsed.data;
  const db = getDb();

  let records: ActivityRecord[] | undefined;
  if (record) {
    const number = /^#?\d{1,7}$/.test(record) ? Number(record.replace("#", "")) : null;
    if (number !== null) records = await pedidoRecordByNumber(db, number);
    else {
      const matches = await db
        .select({ id: clients.id })
        .from(clients)
        .where(ilike(clients.name, `%${record.replace(/[%_\\]/g, "\\$&")}%`))
        .limit(20);
      records = await clientRecords(
        db,
        matches.map((c) => c.id),
      );
    }
  }
  return {
    success: true,
    data: await listActivity(db, { ...filters, records }, { cursor, limit: 50 }),
  };
}

export async function getActivityPeople(): Promise<ActionResult<{ id: string; name: string }[]>> {
  const user = await sessionUser();
  if (!user) return fail("UNAUTHORIZED", "No autenticado");
  if (!hasRole(user, "admin")) return fail("FORBIDDEN", "Sin permisos");
  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .orderBy(asc(users.name));
  return { success: true, data: rows };
}

const HISTORY_ROLES = {
  pedido: ["admin", "cashier", "secretary"],
  ticket: ["admin", "cashier", "secretary"],
  client: ["admin", "cashier", "secretary"],
  employee: ["admin"],
} as const;

const historySchema = z.object({
  entityType: z.enum(["pedido", "ticket", "client", "employee"]),
  entityId: z.uuid(),
  cursor: cursorSchema,
});

export async function getRecordHistory(rawInput: unknown): Promise<ActionResult<ActivityPage>> {
  const user = await sessionUser();
  if (!user) return fail("UNAUTHORIZED", "No autenticado");
  const parsed = historySchema.safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Registro inválido");
  const { entityType, entityId, cursor } = parsed.data;
  if (!hasRole(user, ...HISTORY_ROLES[entityType])) return fail("FORBIDDEN", "Sin permisos");

  const db = getDb();
  const records =
    entityType === "client" ? await clientRecords(db, [entityId]) : [{ entityType, entityId }];
  return { success: true, data: await listActivity(db, { records }, { cursor, limit: 30 }) };
}
