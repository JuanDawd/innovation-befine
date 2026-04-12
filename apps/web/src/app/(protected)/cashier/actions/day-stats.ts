"use server";

/**
 * Day-at-a-glance stats — T093
 *
 * Returns today's revenue (sum of closed ticket totals for the current business day).
 * Open ticket count comes from the existing listOpenTickets action.
 * Requires cashier_admin role.
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tickets, ticketItems } from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";

export type DayStats = {
  revenue: number;
  businessDayId: string | null;
};

export async function getDayStats(): Promise<ActionResult<DayStats>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay) return { success: true, data: { revenue: 0, businessDayId: null } };

  const db = getDb();

  // Sum effective prices for all closed tickets in this business day
  const rows = await db
    .select({
      unitPrice: ticketItems.unitPrice,
      overridePrice: ticketItems.overridePrice,
      quantity: ticketItems.quantity,
    })
    .from(ticketItems)
    .innerJoin(tickets, eq(ticketItems.ticketId, tickets.id))
    .where(and(eq(tickets.businessDayId, businessDay.id), eq(tickets.status, "closed")));

  const revenue = rows.reduce((sum, r) => sum + (r.overridePrice ?? r.unitPrice) * r.quantity, 0);

  return { success: true, data: { revenue, businessDayId: businessDay.id } };
}
