/**
 * Day-at-a-glance stats — T093, T130
 *
 * Today's till: everything taken on the current business day, split into
 * Servicios · Pedidos · Prendas with totals per method and the after-hours
 * line (getDayIncome — ticket payments, pedido payments and garment sales,
 * refunds netted). Plus the charged ticket count.
 * Requires cashier or admin role.
 */

import { headers } from "next/headers";
import { eq, and, count, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tickets } from "@befine/db/schema";
import { getDayIncome, summarizeDayIncome, type DayIncome } from "@befine/db";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentBusinessDay } from "@/lib/business-day";

export type DayStats = {
  /** Everything the till took today (= income.total) */
  revenue: number;
  income: DayIncome;
  closedCount: number;
  businessDayId: string | null;
};

export async function getDayStats(): Promise<ActionResult<DayStats>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier", "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const businessDay = await getCurrentBusinessDay();
  if (!businessDay)
    return {
      success: true,
      data: { revenue: 0, income: summarizeDayIncome([]), closedCount: 0, businessDayId: null },
    };

  const db = getDb();
  const [income, countRows] = await Promise.all([
    getDayIncome(db, businessDay.id),
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

  return {
    success: true,
    data: {
      revenue: income.total,
      income,
      closedCount: countRows[0]?.cnt ?? 0,
      businessDayId: businessDay.id,
    },
  };
}
