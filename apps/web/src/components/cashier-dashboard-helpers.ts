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

// ─── Board grouping ──────────────────────────────────────────────────────────

/** Board sections in the order the cashier works them: charge first. */
export const BOARD_GROUPS = ["awaiting_payment", "logged", "reopened"] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number];

/** Groups open tickets by status, oldest first inside each group. Empty groups are dropped. */
export function groupByStatus(
  tickets: DashboardTicket[],
): { status: BoardGroup; tickets: DashboardTicket[] }[] {
  return BOARD_GROUPS.map((status) => ({
    status,
    tickets: tickets
      .filter((t) => t.status === status)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  })).filter((g) => g.tickets.length > 0);
}

export function ticketTotal(ticket: DashboardTicket): number {
  return ticket.unitPrice * ticket.quantity;
}

// ─── Ticket age ──────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A ticket open longer than this is flagged on the board. */
export const STALE_AFTER_MS = 2 * HOUR;

/** Compact age: "< 1 min", "45 min", "3 h 10 min", "5 d". */
export function formatAge(ms: number): string {
  if (ms < MINUTE) return "< 1 min";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) {
    const mins = Math.floor((ms % HOUR) / MINUTE);
    return mins ? `${Math.floor(ms / HOUR)} h ${mins} min` : `${Math.floor(ms / HOUR)} h`;
  }
  return `${Math.floor(ms / DAY)} d`;
}

export function isStale(ms: number): boolean {
  return ms >= STALE_AFTER_MS;
}

/** Whole days since `date`; used to flag a business day left open overnight. */
export function daysSince(date: Date, now = Date.now()): number {
  return Math.floor((now - new Date(date).getTime()) / DAY);
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** Lowercase and strip accents so "maria" matches "María". */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesQuery(ticket: DashboardTicket, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return [ticket.clientName, ticket.serviceName, ticket.variantName, ticket.employeeName].some(
    (field) => normalizeSearch(field).includes(q),
  );
}
