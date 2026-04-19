/**
 * T063 — Stylist earnings computation
 *
 * Sums (override_price ?? unit_price) * commission_pct / 100
 * for all closed ticket items belonging to the employee in the given business days.
 * Tickets flagged needs_review are excluded with a note in the breakdown.
 * Uses banker's rounding (round half-even) per CLAUDE.md.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@befine/db";
import { tickets, ticketItems, serviceVariants } from "@befine/db/schema";

export type StylistEarningsLine = {
  ticketId: string;
  serviceVariantId: string;
  serviceName: string | null;
  quantity: number;
  effectivePrice: number;
  commissionPct: number;
  earnings: number;
  excluded: false;
};

export type StylistEarningsExcludedLine = {
  ticketId: string;
  excluded: true;
  reason: "needs_review";
};

export type StylistEarningsResult = {
  employeeId: string;
  businessDayIds: string[];
  totalEarnings: number;
  lines: (StylistEarningsLine | StylistEarningsExcludedLine)[];
};

/** Banker's rounding (round half-even) */
function bankersRound(n: number): number {
  const floor = Math.floor(n);
  const frac = n - floor;
  if (Math.abs(frac - 0.5) > Number.EPSILON) return Math.round(n);
  return floor % 2 === 0 ? floor : floor + 1;
}

export async function computeStylistEarnings(
  db: Database,
  employeeId: string,
  businessDayIds: string[],
): Promise<StylistEarningsResult> {
  if (businessDayIds.length === 0)
    return { employeeId, businessDayIds, totalEarnings: 0, lines: [] };

  const rows = await db
    .select({
      ticketId: tickets.id,
      needsReview: tickets.needsReview,
      ticketItemId: ticketItems.id,
      serviceVariantId: ticketItems.serviceVariantId,
      quantity: ticketItems.quantity,
      unitPrice: ticketItems.unitPrice,
      commissionPct: ticketItems.commissionPct,
      overridePrice: ticketItems.overridePrice,
      variantName: serviceVariants.name,
    })
    .from(tickets)
    .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
    .innerJoin(serviceVariants, eq(ticketItems.serviceVariantId, serviceVariants.id))
    .where(
      and(
        eq(tickets.employeeId, employeeId),
        inArray(tickets.businessDayId, businessDayIds),
        eq(tickets.status, "closed"),
      ),
    );

  const lines: (StylistEarningsLine | StylistEarningsExcludedLine)[] = [];
  let totalEarnings = 0;

  const seenNeedsReview = new Set<string>();

  for (const row of rows) {
    if (row.needsReview) {
      if (!seenNeedsReview.has(row.ticketId)) {
        seenNeedsReview.add(row.ticketId);
        lines.push({ ticketId: row.ticketId, excluded: true, reason: "needs_review" });
      }
      continue;
    }

    const effectivePrice = row.overridePrice ?? row.unitPrice;
    const pct = Number(row.commissionPct);
    const earnings = bankersRound((effectivePrice * pct * row.quantity) / 100);
    totalEarnings += earnings;

    lines.push({
      ticketId: row.ticketId,
      serviceVariantId: row.serviceVariantId,
      serviceName: row.variantName,
      quantity: row.quantity,
      effectivePrice,
      commissionPct: pct,
      earnings,
      excluded: false,
    });
  }

  return { employeeId, businessDayIds, totalEarnings, lines };
}
