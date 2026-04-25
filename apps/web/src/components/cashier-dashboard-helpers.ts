import type { DashboardTicket } from "@/app/(protected)/tickets/actions";

export type OptimisticStatusUpdate = { id: string; status: DashboardTicket["status"] };

/**
 * Pure reducer used with React's `useOptimistic` (T10R-R2).
 *
 * Note: the revert-on-error contract is provided by `useOptimistic` itself —
 * if the surrounding transition resolves without committing the source state
 * (e.g. the server action fails and the handler bails out), React drops the
 * optimistic layer and the UI returns to the source array. This reducer just
 * has to be pure.
 */
export function optimisticStatusReducer(
  current: DashboardTicket[],
  update: OptimisticStatusUpdate,
): DashboardTicket[] {
  return current.map((t) => (t.id === update.id ? { ...t, status: update.status } : t));
}
