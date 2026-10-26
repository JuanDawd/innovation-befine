"use server";

/**
 * Catalog audit log read action — T025 (T02R-R1)
 *
 * Fetches the audit history for a specific catalog entity.
 * Admin-only. Reads activity_log since T114 (the old catalog audit table was folded in).
 */

import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activityLog, users } from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { auditLogPageSchema } from "@befine/types";

/** Entries per page — "Ver más" loads the next page (L-03). */
const PAGE_SIZE = 20;

export type AuditLogPage = { entries: AuditLogEntry[]; hasMore: boolean };

export type AuditLogEntry = {
  id: string;
  action: "create" | "update" | "soft_delete" | "restore";
  changedByName: string;
  summary: string;
  changedAt: Date;
  previousData: unknown;
  newData: unknown;
};

const ACTION_KIND: Record<string, AuditLogEntry["action"]> = {
  "catalog.create": "create",
  "catalog.update": "update",
  "catalog.reorder": "update",
  "catalog.deactivate": "soft_delete",
  "catalog.restore": "restore",
};

export async function getEntityAuditLog(rawInput: unknown): Promise<ActionResult<AuditLogPage>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const parsed = auditLogPageSchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };
  const { entityId, beforeId } = parsed.data;

  const db = getDb();
  const rows = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      changedByName: users.name,
      summary: activityLog.summary,
      changedAt: activityLog.createdAt,
      previousData: activityLog.before,
      newData: activityLog.after,
    })
    .from(activityLog)
    .leftJoin(users, eq(activityLog.actorUserId, users.id))
    .where(
      and(
        eq(activityLog.entityId, entityId),
        // Keyset on (created_at, id), resolved in the DB so timestamps keep
        // microsecond precision (a JS Date would round them).
        beforeId
          ? sql`(${activityLog.createdAt}, ${activityLog.id}) < (
              SELECT created_at, id FROM activity_log WHERE id = ${beforeId}
            )`
          : undefined,
      ),
    )
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(PAGE_SIZE + 1);

  return {
    success: true,
    data: {
      entries: rows.slice(0, PAGE_SIZE).map((r) => ({
        ...r,
        action: ACTION_KIND[r.action] ?? "update",
        changedByName: r.changedByName ?? "—",
      })),
      hasMore: rows.length > PAGE_SIZE,
    },
  };
}
