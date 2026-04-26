"use server";

/**
 * Day-at-a-glance stats — T093
 *
 * Returns today's revenue, closed ticket count, and open ticket count for the current business day.
 * Requires cashier_admin role.
 */

import { headers } from "next/headers";
import { eq, and, count, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tickets, ticketItems } from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";

export type DayStats = {
  revenue: number;
  closedCount: number;
  businessDayId: string | null;
};

export async function getDayStats(): Promise<ActionResult<DayStats>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay)
    return { success: true, data: { revenue: 0, closedCount: 0, businessDayId: null } };

  const db = getDb();

  const [revenueRows, countRows] = await Promise.all([
    db
      .select({
        unitPrice: ticketItems.unitPrice,
        overridePrice: ticketItems.overridePrice,
        quantity: ticketItems.quantity,
      })
      .from(ticketItems)
      .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
      .where(and(eq(tickets.businessDayId, businessDay.id), eq(tickets.status, "closed"))),

    db
      .select({ cnt: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.businessDayId, businessDay.id),
          sql`${tickets.status} IN ('closed', 'paid_offline')`,
        ),
      ),
  ]);

  const revenue = revenueRows.reduce(
    (sum, r) => sum + (r.overridePrice ?? r.unitPrice) * r.quantity,
    0,
  );
  const closedCount = countRows[0]?.cnt ?? 0;

  return { success: true, data: { revenue, closedCount, businessDayId: businessDay.id } };
}
