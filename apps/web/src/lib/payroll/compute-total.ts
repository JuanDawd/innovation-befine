import type { Database } from "@befine/db";
import { computeStylistEarnings } from "@/lib/payroll/compute-stylist-earnings";
import { computeClothierEarnings } from "@/lib/payroll/compute-clothier-earnings";
import { computeSecretaryEarnings } from "@/lib/payroll/compute-secretary-earnings";

/** Total earnings for an employee over the given business days, by earnings model. */
export async function computeEarningsTotal(
  db: Database,
  role: string,
  employeeId: string,
  businessDayIds: string[],
): Promise<number> {
  if (role === "stylist")
    return (await computeStylistEarnings(db, employeeId, businessDayIds)).totalEarnings;
  if (role === "clothier")
    return (await computeClothierEarnings(db, employeeId, businessDayIds)).totalEarnings;
  return (await computeSecretaryEarnings(db, employeeId, businessDayIds)).totalEarnings;
}
