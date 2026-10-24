/**
 * Payroll queries — Stabilization-1
 *
 * getUnpaidPastBusinessDays: closed business_days for `employeeId` that do not
 * have a covering payout row (via the payout_period_days junction). Excludes
 * the currently-open business day, since it cannot be settled until closed.
 *
 * Returns ascending by date so the caller can show oldest-first.
 *
 * flagPayoutsCoveringTicket (M-28): marks every payout linked to one of the
 * ticket's items as needs_review — called when a closed ticket is reopened.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../index";
import { businessDays, payoutPeriodDays, payouts, payoutTicketItems, ticketItems } from "../schema";

export type UnpaidPastBusinessDay = {
  businessDayId: string;
  date: string;
};

export async function getUnpaidPastBusinessDays(
  db: Database,
  employeeId: string,
): Promise<UnpaidPastBusinessDay[]> {
  const closed = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(isNotNull(businessDays.closedAt))
    .orderBy(businessDays.openedAt);

  if (closed.length === 0) return [];

  const settled = await db
    .select({ businessDayId: payoutPeriodDays.businessDayId })
    .from(payoutPeriodDays)
    .where(
      and(
        eq(payoutPeriodDays.employeeId, employeeId),
        inArray(
          payoutPeriodDays.businessDayId,
          closed.map((d) => d.id),
        ),
      ),
    );

  const settledIds = new Set(settled.map((r) => r.businessDayId));

  return closed
    .filter((d) => !settledIds.has(d.id))
    .map((d) => ({
      businessDayId: d.id,
      date: new Date(d.openedAt).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }),
    }));
}

/** Returns the ids of the payouts that were flagged. */
export async function flagPayoutsCoveringTicket(db: Database, ticketId: string): Promise<string[]> {
  const rows = await db
    .update(payouts)
    .set({ needsReview: true })
    .where(
      inArray(
        payouts.id,
        db
          .select({ id: payoutTicketItems.payoutId })
          .from(payoutTicketItems)
          .innerJoin(ticketItems, eq(payoutTicketItems.ticketItemId, ticketItems.id))
          .where(eq(ticketItems.ticketId, ticketId)),
      ),
    )
    .returning({ id: payouts.id });
  return rows.map((r) => r.id);
}
