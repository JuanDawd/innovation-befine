/**
 * Per-cell production progress — T112 (spec §3.2–3.3)
 *
 * Derived from assignments, reports, reviews and deliveries; never stored.
 * The same rules the DB triggers enforce (0042_production_unit_guards.sql):
 * scrapped units leave their assignment and re-open on the cell; returned
 * units come back as rework and are reviewed again.
 */

export type ProgressAssignment = {
  quantity: number;
  reports: { quantity: number; kind: "report" | "rework" }[];
  reviews: { approved: number; returned: number; scrapped: number }[];
};

export type CellProgress = {
  ordered: number;
  /** Units held by clothiers (assignment quantity minus scrapped) */
  assigned: number;
  /** Units nobody holds — available to assign or claim */
  unassigned: number;
  /** Units reported finished, first time plus rework */
  reported: number;
  approved: number;
  returned: number;
  scrapped: number;
  /** Reported and waiting for a decision */
  pendingReview: number;
  /** Returned and not yet re-reported */
  inRework: number;
  delivered: number;
  /** Approved and not yet delivered */
  readyToDeliver: number;
};

export type AssignmentProgress = {
  /** Units the clothier still holds (quantity − scrapped) */
  live: number;
  /** First-time reports */
  reported: number;
  rework: number;
  approved: number;
  returned: number;
  scrapped: number;
  pendingReview: number;
  inRework: number;
  /** Units not reported yet — the only ones a clothier may release */
  unstarted: number;
};

const sum = <T>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

export function summarizeAssignment(a: ProgressAssignment): AssignmentProgress {
  const reported = sum(
    a.reports.filter((r) => r.kind === "report"),
    (r) => r.quantity,
  );
  const rework = sum(
    a.reports.filter((r) => r.kind === "rework"),
    (r) => r.quantity,
  );
  const approved = sum(a.reviews, (r) => r.approved);
  const returned = sum(a.reviews, (r) => r.returned);
  const scrapped = sum(a.reviews, (r) => r.scrapped);
  return {
    live: a.quantity - scrapped,
    reported,
    rework,
    approved,
    returned,
    scrapped,
    pendingReview: reported + rework - approved - returned - scrapped,
    inRework: returned - rework,
    unstarted: a.quantity - reported,
  };
}

export function summarizeCell(cell: {
  quantity: number;
  assignments: ProgressAssignment[];
  deliveries: { quantity: number }[];
}): CellProgress {
  const parts = cell.assignments.map(summarizeAssignment);
  const assigned = sum(parts, (p) => p.live);
  const approved = sum(parts, (p) => p.approved);
  const delivered = sum(cell.deliveries, (d) => d.quantity);
  return {
    ordered: cell.quantity,
    assigned,
    unassigned: Math.max(cell.quantity - assigned, 0),
    reported: sum(parts, (p) => p.reported + p.rework),
    approved,
    returned: sum(parts, (p) => p.returned),
    scrapped: sum(parts, (p) => p.scrapped),
    pendingReview: sum(parts, (p) => p.pendingReview),
    inRework: sum(parts, (p) => p.inRework),
    delivered,
    readyToDeliver: Math.max(approved - delivered, 0),
  };
}

/** Totals across cells (a line or a whole pedido). */
export function sumProgress(cells: CellProgress[]): CellProgress {
  const keys = [
    "ordered",
    "assigned",
    "unassigned",
    "reported",
    "approved",
    "returned",
    "scrapped",
    "pendingReview",
    "inRework",
    "delivered",
    "readyToDeliver",
  ] as const;
  const total = Object.fromEntries(keys.map((k) => [k, 0])) as CellProgress;
  for (const c of cells) for (const k of keys) total[k] += c[k];
  return total;
}
