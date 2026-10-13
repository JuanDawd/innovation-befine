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
 *
 * Paid per distinct calendar date: a business day closed and reopened on the
 * same date is one day worked, and a date already covered by an earlier payout
 * (through its sibling business day) is not paid again.
 */

import { and, eq, gte, inArray, lte, notInArray, or } from "drizzle-orm";
import type { Database } from "@befine/db";
import { businessDays, employees, employeeAbsences, payoutPeriodDays } from "@befine/db/schema";
import { businessDateOf } from "@/lib/dates";
import { countSecretaryDays } from "./secretary-days";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const dayDateMap = new Map(bdRows.map((r) => [r.id, businessDateOf(r.openedAt)]));

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

  const openTimes = bdRows.map((r) => new Date(r.openedAt).getTime());
  const periodStart = new Date(Math.min(...openTimes));
  const periodEnd = new Date(Math.max(...openTimes));

  // Dates already paid through a sibling business day (same date, different id)
  const alreadyPaid = !bdRows.length
    ? []
    : await db
        .select({ openedAt: businessDays.openedAt })
        .from(payoutPeriodDays)
        .innerJoin(businessDays, eq(payoutPeriodDays.businessDayId, businessDays.id))
        .where(
          and(
            eq(payoutPeriodDays.employeeId, employeeId),
            notInArray(payoutPeriodDays.businessDayId, businessDayIds),
            // Only siblings can share a date: bound the scan to the period ±1 day
            gte(businessDays.openedAt, new Date(periodStart.getTime() - DAY_MS)),
            lte(businessDays.openedAt, new Date(periodEnd.getTime() + DAY_MS)),
          ),
        );
  for (const row of alreadyPaid) {
    const date = businessDateOf(row.openedAt);
    if (dateStrings.includes(date)) excludedDates.add(date);
  }

  const expectedWorkDays = emp.expectedWorkDays;
  const daysWorked = countSecretaryDays(dayDateMap.values(), excludedDates, expectedWorkDays);

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
