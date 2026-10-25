/**
 * Apply a closing count to one assignment — T125
 *
 * Server-only helper shared by the clothier's closing and staff corrections.
 * Locks the assignment, computes today's state, plans with planDayCount
 * (@befine/db) and writes the report rows. Throws DayCountError with a
 * Spanish message when the count is not possible.
 */

import { eq, sql } from "drizzle-orm";
import { unitReports } from "@befine/db/schema";
import { planDayCount } from "@befine/db";
import type { ActivityTx } from "@/lib/activity";

export class DayCountError extends Error {
  constructor(
    readonly assignmentId: string,
    message: string,
  ) {
    super(message);
  }
}

export async function applyDayCount(
  tx: ActivityTx,
  input: {
    assignmentId: string;
    /** Whose work it is: refuses someone else's assignment */
    employeeId: string;
    businessDayId: string;
    target: number;
    /** Who writes any new report rows (the clothier, or staff correcting) */
    reportedBy: string;
    /** Per-submit key; rows get `${key}:${assignmentId}:${kind}` */
    key: string;
  },
): Promise<{ before: number; after: number }> {
  const res = await tx.execute(sql`
    SELECT a.id, a.employee_id, a.quantity,
      coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'report'), 0)::int AS reported,
      coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'rework'), 0)::int AS rework,
      coalesce((SELECT sum(x.returned) FROM unit_reviews x WHERE x.assignment_id = a.id), 0)::int AS returned,
      coalesce((SELECT sum(x.approved + x.returned + x.scrapped) FROM unit_reviews x WHERE x.assignment_id = a.id), 0)::int AS reviewed
    FROM assignments a WHERE a.id = ${input.assignmentId}
    FOR UPDATE OF a
  `);
  const a = res.rows[0] as
    | {
        employee_id: string;
        quantity: number;
        reported: number;
        rework: number;
        returned: number;
        reviewed: number;
      }
    | undefined;
  if (!a || a.employee_id !== input.employeeId)
    throw new DayCountError(input.assignmentId, "Un trabajo de la lista ya no es tuyo. Actualiza.");

  const todayRows = await tx
    .select({ id: unitReports.id, quantity: unitReports.quantity, kind: unitReports.kind })
    .from(unitReports)
    .where(
      sql`${unitReports.assignmentId} = ${input.assignmentId} AND ${unitReports.businessDayId} = ${input.businessDayId}`,
    )
    .orderBy(unitReports.createdAt);
  const reportedToday = todayRows.reduce((n, r) => n + r.quantity, 0);

  const plan = planDayCount(input.target, {
    reportedToday,
    todayRows,
    inRework: Number(a.returned) - Number(a.rework),
    unstarted: Number(a.quantity) - Number(a.reported),
    pendingReview: Number(a.reported) + Number(a.rework) - Number(a.reviewed),
  });
  if (!plan.ok) throw new DayCountError(input.assignmentId, plan.message);

  for (const t of plan.trim) {
    if (t.quantity === 0) await tx.delete(unitReports).where(eq(unitReports.id, t.id));
    else await tx.update(unitReports).set({ quantity: t.quantity }).where(eq(unitReports.id, t.id));
  }
  if (plan.add.length)
    await tx.insert(unitReports).values(
      plan.add.map((r) => ({
        assignmentId: input.assignmentId,
        quantity: r.quantity,
        kind: r.kind,
        businessDayId: input.businessDayId,
        reportedBy: input.reportedBy,
        idempotencyKey: `${input.key}:${input.assignmentId}:${r.kind}`,
      })),
    );
  return { before: reportedToday, after: input.target };
}
