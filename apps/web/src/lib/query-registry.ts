/**
 * Allowlist of read-only queries served by GET /api/q/[name] (M-64).
 *
 * Why: Next.js runs server actions one at a time per client, so dialog loads
 * queued behind dashboard polling (10–20 s waits). GET route handlers run in
 * parallel. Each entry calls the existing read function, which keeps doing its
 * own session + role check and input validation — this file adds no access.
 *
 * Only reads belong here. Mutations stay server actions.
 */
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { listActiveServices } from "@/app/(protected)/admin/catalog/actions/services";
import {
  listAppointmentsForDate,
  listBookingStylists,
} from "@/app/(protected)/appointments/actions";
import { getDayStats } from "@/app/(protected)/cashier/actions/day-stats";
import {
  listClientsForSale,
  listSellableClothPieces,
} from "@/app/(protected)/cashier/actions/cloth-sales";
import { getAwaitingPaymentTickets } from "@/app/(protected)/cashier/checkout/actions";
import { listTodayProductPieces } from "@/app/(protected)/clothier/actions";
import { getMyWork } from "@/app/(protected)/clothier/work-actions";
import { listActiveClothiers } from "@/app/(protected)/large-orders/assignment-actions";
import { getProductsDashboardData } from "@/app/(protected)/products/actions";
import { listPendingProductPieceApprovals } from "@/app/(protected)/products/approval-actions";
import { listActiveStylists, listOpenTickets } from "@/app/(protected)/tickets/actions";
import {
  listMyEditRequests,
  listMyOpenTicketItems,
  listPendingEditRequests,
} from "@/app/(protected)/tickets/edit-requests/actions";

export const QUERIES = {
  activeClothPieces: () => listActiveClothPieces(),
  activeClothiers: () => listActiveClothiers(),
  activeServices: () => listActiveServices(),
  activeStylists: () => listActiveStylists(),
  appointmentsForDate: (p: URLSearchParams) =>
    listAppointmentsForDate(p.get("date"), p.get("stylist") || undefined),
  awaitingPaymentTickets: () => getAwaitingPaymentTickets(),
  bookingStylists: () => listBookingStylists(),
  clientsForSale: () => listClientsForSale(),
  dayStats: () => getDayStats(),
  myEditRequests: () => listMyEditRequests(),
  myWork: () => getMyWork(),
  myOpenTicketItems: () => listMyOpenTicketItems(),
  openTickets: () => listOpenTickets(),
  pendingEditRequests: () => listPendingEditRequests(),
  pendingProductPieceApprovals: () => listPendingProductPieceApprovals(),
  productsDashboard: () => getProductsDashboardData(),
  sellableClothPieces: () => listSellableClothPieces(),
  todayProductPieces: () => listTodayProductPieces(),
} satisfies Record<string, (params: URLSearchParams) => Promise<unknown>>;

export type QueryRegistry = typeof QUERIES;
export type QueryName = keyof QueryRegistry;
