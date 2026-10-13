import { isoWeekKey } from "@/lib/dates";

/**
 * Days a secretary is paid for in a period: one per distinct calendar date
 * (YYYY-MM-DD, Bogota), minus vacation/approved-absence dates, capped per ISO
 * week at `expectedWorkDays`.
 *
 * Dates are deduplicated: if the business day was closed and a new one opened
 * on the same date, that is still one day worked — not two daily rates.
 */
export function countSecretaryDays(
  dates: Iterable<string>,
  excludedDates: Iterable<string>,
  expectedWorkDays: number,
): number {
  const excluded = new Set(excludedDates);
  const weekDates = new Map<string, Set<string>>();
  for (const d of new Set(dates)) {
    if (excluded.has(d)) continue;
    const week = isoWeekKey(d);
    const set = weekDates.get(week) ?? new Set<string>();
    set.add(d);
    weekDates.set(week, set);
  }
  let total = 0;
  for (const set of weekDates.values()) total += Math.min(set.size, expectedWorkDays);
  return total;
}
