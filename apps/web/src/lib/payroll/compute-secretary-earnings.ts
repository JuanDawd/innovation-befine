/**
 * T065 — Secretary earnings computation
 *
 * Counts business days the secretary was present (open business days in the period
 * minus vacation + approved_absence days), capped by expected_work_days per week.
 * Multiplies by daily_rate.
 *
 * MVP rule: for each ISO week in the period, count min(present_days, expected_work_days).
 * "Present" means the day exists as a closed business day and has no vacation/approved_absence record.
 * Missed days still count as present (employee was expected; absence type "missed" is not deducted).
 */

import { and, eq, inArray, or } from "drizzle-orm";
import type { Database } from "@befine/db";
import { businessDays, employees, employeeAbsences } from "@befine/db/schema";
import { isoWeekKey } from "@/lib/dates";

export type SecretaryEarningsResult = {
  employeeId: string;
  businessDayIds: string[];
  daysWorked: number;
  dailyRate: number;
  expectedWorkDays: number;
  totalEarnings: number;
};

export async function computeSecretaryEarnings(
  db: Database,
  employeeId: string,
  businessDayIds: string[],
): Promise<SecretaryEarningsResult> {
  if (businessDayIds.length === 0) {
    const [emp] = await db
      .select({ dailyRate: employees.dailyRate, expectedWorkDays: employees.expectedWorkDays })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    return {
      employeeId,
      businessDayIds,
      daysWorked: 0,
      dailyRate: emp?.dailyRate ?? 0,
      expectedWorkDays: emp?.expectedWorkDays ?? 6,
      totalEarnings: 0,
    };
  }

  // Fetch employee data + business days (to get their dates) + absences
  const [emp] = await db
    .select({ dailyRate: employees.dailyRate, expectedWorkDays: employees.expectedWorkDays })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp || !emp.dailyRate)
    return {
      employeeId,
      businessDayIds,
      daysWorked: 0,
      dailyRate: 0,
      expectedWorkDays: emp?.expectedWorkDays ?? 6,
      totalEarnings: 0,
    };

  // Fetch closed business days in the period
  const bdRows = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(inArray(businessDays.id, businessDayIds));

  // Only count closed days (days with a closedAt — open day not settled yet)
  // For MVP: all provided businessDayIds are assumed to be closed (admin selects past days)
  const dayDateMap = new Map(
    bdRows.map((r) => [r.id, new Date(r.openedAt).toISOString().slice(0, 10)]),
  );

  // Fetch vacation + approved_absence records for this employee in this period
  const dateStrings = Array.from(dayDateMap.values());
  const absenceRows = await db
    .select({ date: employeeAbsences.date, type: employeeAbsences.type })
    .from(employeeAbsences)
    .where(
      and(
        eq(employeeAbsences.employeeId, employeeId),
        inArray(employeeAbsences.date, dateStrings),
        or(eq(employeeAbsences.type, "vacation"), eq(employeeAbsences.type, "approved_absence")),
      ),
    );

  const excludedDates = new Set(absenceRows.map((a) => a.date));

  // Count present days per ISO week, capped by expectedWorkDays
  const weekCounts = new Map<string, number>();
  for (const [, dateStr] of dayDateMap) {
    if (excludedDates.has(dateStr)) continue;
    const week = isoWeekKey(dateStr);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
  }

  const expectedWorkDays = emp.expectedWorkDays;
  let daysWorked = 0;
  for (const count of weekCounts.values()) {
    daysWorked += Math.min(count, expectedWorkDays);
  }

  const totalEarnings = daysWorked * emp.dailyRate;

  return {
    employeeId,
    businessDayIds,
    daysWorked,
    dailyRate: emp.dailyRate,
    expectedWorkDays,
    totalEarnings,
  };
}
