/**
 * Admin-approved restructure — T120 (spec §3.4.17)
 *
 * Pure: given what a cell holds and what the draft asks for, works out every
 * write of the event, or why it cannot happen. Runs when the draft is made and
 * again on approval, because production keeps moving in between.
 */

export type RestructureAssignment = {
  id: string;
  employeeId: string;
  quantity: number;
  movedOut: number;
  reported: number;
  rework: number;
  approved: number;
  returned: number;
  scrapped: number;
};

export type RestructureCell = {
  cellId: string;
  label: string;
  ordered: number;
  delivered: number;
  assignments: RestructureAssignment[];
};

export type RestructureDecision = {
  cellId: string;
  newQuantity: number;
  toStock: number;
  toScrap: number;
  pendingAction?: "approve" | "reject";
};

export type RestructureCellPlan = {
  cellId: string;
  label: string;
  before: { ordered: number; approved: number; delivered: number };
  newQuantity: number;
  toStock: number;
  toScrap: number;
  pendingApproved: number;
  pendingRejected: number;
  /** New reviews, one per assignment with units waiting */
  reviews: { assignmentId: string; approved: number; rejected: number }[];
  moves: { assignmentId: string; quantity: number }[];
  /** Unstarted units cancelled */
  releases: { assignmentId: string; employeeId: string; quantity: number }[];
};

export type RestructurePlan =
  { ok: true; cell: RestructureCellPlan } | { ok: false; message: string };

const pendingOf = (a: RestructureAssignment) =>
  a.reported + a.rework - a.approved - a.returned - a.scrapped;
const inReworkOf = (a: RestructureAssignment) => a.returned - a.rework;
const netApprovedOf = (a: RestructureAssignment) => a.approved - a.movedOut;

export function planRestructureCell(
  cell: RestructureCell,
  decision: RestructureDecision,
): RestructurePlan {
  const fail = (message: string): RestructurePlan => ({ ok: false, message });
  const { label, delivered } = cell;
  const { newQuantity, toStock, toScrap, pendingAction } = decision;

  if (cell.assignments.some((a) => inReworkOf(a) > 0))
    return fail(`La talla ${label} tiene correcciones en curso. Resuélvelas primero.`);

  const waiting = cell.assignments.filter((a) => pendingOf(a) > 0);
  const pending = waiting.reduce((n, a) => n + pendingOf(a), 0);
  if (pending > 0 && !pendingAction)
    return fail(`La talla ${label} tiene ${pending} sin revisar: elige aprobarlas o rechazarlas.`);

  const approving = pendingAction === "approve";
  const reviews = waiting.map((a) => ({
    assignmentId: a.id,
    approved: approving ? pendingOf(a) : 0,
    rejected: approving ? 0 : pendingOf(a),
  }));

  const netApproved = cell.assignments.reduce((n, a) => n + netApprovedOf(a), 0);
  const approvedAfterReview = netApproved + (approving ? pending : 0);
  const leaving = toStock + toScrap;

  if (leaving > approvedAfterReview - delivered)
    return fail(
      `La talla ${label} solo tiene ${Math.max(approvedAfterReview - delivered, 0)} aprobadas sin entregar.`,
    );
  if (newQuantity < delivered)
    return fail(`La talla ${label} ya entregó ${delivered}: no puede quedar con ${newQuantity}.`);
  if (approvedAfterReview - leaving > newQuantity)
    return fail(
      `La talla ${label} quedaría con ${approvedAfterReview - leaving} aprobadas y ${newQuantity} pedidas. Saca ${approvedAfterReview - leaving - newQuantity} más.`,
    );

  // Which clothier's approved units leave does not change anyone's pay.
  let toMove = leaving;
  const moves: RestructureCellPlan["moves"] = [];
  for (const a of cell.assignments) {
    const available = netApprovedOf(a) + (approving ? pendingOf(a) : 0);
    const quantity = Math.min(available, toMove);
    if (quantity > 0) moves.push({ assignmentId: a.id, quantity });
    toMove -= quantity;
  }

  // Unstarted units go last-assigned first, and only as many as no longer fit.
  const moved = (id: string) => moves.find((m) => m.assignmentId === id)?.quantity ?? 0;
  const rejected = (id: string) => reviews.find((r) => r.assignmentId === id)?.rejected ?? 0;
  const liveAfter = cell.assignments.reduce(
    (n, a) => n + a.quantity - a.scrapped - a.movedOut - moved(a.id) - rejected(a.id),
    0,
  );
  let excess = liveAfter - newQuantity;
  const releases: RestructureCellPlan["releases"] = [];
  for (const a of [...cell.assignments].reverse()) {
    if (excess <= 0) break;
    const quantity = Math.min(a.quantity - a.reported, excess);
    if (quantity > 0) releases.push({ assignmentId: a.id, employeeId: a.employeeId, quantity });
    excess -= quantity;
  }

  return {
    ok: true,
    cell: {
      cellId: cell.cellId,
      label,
      before: { ordered: cell.ordered, approved: netApproved, delivered },
      newQuantity,
      toStock,
      toScrap,
      pendingApproved: approving ? pending : 0,
      pendingRejected: approving ? 0 : pending,
      reviews,
      moves,
      releases,
    },
  };
}
