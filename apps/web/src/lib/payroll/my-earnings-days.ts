/**
 * Which business days feed each "Mis ganancias" total.
 *
 * A day belongs to the Bogota date it was opened on. The open business day is
 * always counted — it is the day in progress even when it crossed midnight —
 * so "Hoy" reflects work charged or approved so far instead of $0 until close.
 * Days already covered by a payout are left out (T07R-R6).
 */

import { businessDateOf, isoWeekStartOf } from "@/lib/dates";

export type EarningsDay = {
  id: string;
  openedAt: Date | string;
  closedAt: Date | string | null;
};

export type EarningsPeriods = {
  today: string[];
  week: string[];
  month: string[];
  /** The business day still open, when it is not paid — its amounts are provisional */
  openDayId: string | null;
};

export function earningsPeriods(
  days: EarningsDay[],
  paidDayIds: Set<string>,
  todayStr: string,
): EarningsPeriods {
  const unpaid = days.filter((d) => !paidDayIds.has(d.id));
  const openDay = unpaid.find((d) => d.closedAt === null) ?? null;
  const since = (from: string) =>
    unpaid.filter((d) => d === openDay || businessDateOf(d.openedAt) >= from).map((d) => d.id);

  return {
    today: since(todayStr),
    week: since(isoWeekStartOf(todayStr)),
    month: since(`${todayStr.slice(0, 8)}01`),
    openDayId: openDay?.id ?? null,
  };
}
