"use server";

/**
 * Catalog audit log read action — T025 (T02R-R1)
 *
 * Fetches the audit history for a specific catalog entity.
 * Admin-only.
 */

import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { catalogAuditLog, users } from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";

export type AuditLogEntry = {
  id: string;
  action: "create" | "update" | "soft_delete" | "restore";
  changedByName: string;
  changedAt: Date;
  previousData: unknown;
  newData: unknown;
};

export async function getEntityAuditLog(entityId: string): Promise<ActionResult<AuditLogEntry[]>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const rows = await db
    .select({
      id: catalogAuditLog.id,
      action: catalogAuditLog.action,
      changedByName: users.name,
      changedAt: catalogAuditLog.createdAt,
      previousData: catalogAuditLog.previousData,
      newData: catalogAuditLog.newData,
    })
    .from(catalogAuditLog)
    .innerJoin(users, eq(catalogAuditLog.changedBy, users.id))
    .where(eq(catalogAuditLog.entityId, entityId))
    .orderBy(desc(catalogAuditLog.createdAt))
    .limit(50);

  return { success: true, data: rows };
}
