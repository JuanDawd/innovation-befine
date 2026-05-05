/**
 * Craftables dashboard query — Task 3.8
 *
 * getCraftablesDashboard returns:
 *   - Today's craftables (belonging to the current open business day)
 *   - WIP craftables (past days with ≥1 non-approved piece)
 *
 * Sort: WIP first (oldest day first), then today's (newest first).
 */

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../index";
import {
  craftables,
  craftablePieces,
  businessDays,
  employees,
  users,
  clients,
  largeOrders,
} from "../schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CraftableDashboardRow = {
  id: string;
  businessDayId: string;
  businessDayOpenedAt: Date;
  source: "manual" | "large_order";
  autoApproved: boolean;
  notes: string | null;
  createdAt: Date;
  largeOrderId: string | null;
  largeOrderClientName: string | null;
  totalPieces: number;
  approvedPieces: number;
  pendingPieces: number;
  progressPct: number;
  assignedEmployeeNames: string[];
  section: "today" | "wip";
};

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getCraftablesDashboard(db: Database): Promise<CraftableDashboardRow[]> {
  // 1. Find the open business day id (today)
  const [openDay] = await db
    .select({ id: businessDays.id })
    .from(businessDays)
    .where(isNull(businessDays.closedAt))
    .limit(1);

  const todayId = openDay?.id ?? null;

  // 2. Fetch craftables: today's OR from any past day — we'll filter WIP in JS
  //    We need the business day's openedAt for sorting.
  const craftableRows = await db
    .select({
      id: craftables.id,
      businessDayId: craftables.businessDayId,
      businessDayOpenedAt: businessDays.openedAt,
      businessDayClosedAt: businessDays.closedAt,
      source: craftables.source,
      autoApproved: craftables.autoApproved,
      notes: craftables.notes,
      createdAt: craftables.createdAt,
      largeOrderId: craftables.largeOrderId,
    })
    .from(craftables)
    .innerJoin(businessDays, eq(craftables.businessDayId, businessDays.id));

  if (craftableRows.length === 0) return [];

  const craftableIds = craftableRows.map((c) => c.id);

  // 3. Aggregate piece counts per craftable
  const pieceCounts = await db
    .select({
      craftableId: craftablePieces.craftableId,
      total: sql<number>`count(*)::int`,
      approved: sql<number>`count(*) filter (where ${craftablePieces.status} = 'approved')::int`,
    })
    .from(craftablePieces)
    .where(inArray(craftablePieces.craftableId, craftableIds))
    .groupBy(craftablePieces.craftableId);

  const countMap = new Map(
    pieceCounts.map((r) => [r.craftableId, { total: r.total, approved: r.approved }]),
  );

  // 4. Distinct assigned employee names per craftable
  const assigneeRows = await db
    .select({
      craftableId: craftablePieces.craftableId,
      employeeName: users.name,
    })
    .from(craftablePieces)
    .innerJoin(employees, eq(craftablePieces.assignedToEmployeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(
      and(
        inArray(craftablePieces.craftableId, craftableIds),
        ne(craftablePieces.status, "approved"),
      ),
    );

  const assigneeMap = new Map<string, Set<string>>();
  for (const row of assigneeRows) {
    if (!assigneeMap.has(row.craftableId)) assigneeMap.set(row.craftableId, new Set());
    assigneeMap.get(row.craftableId)!.add(row.employeeName);
  }

  // 5. Large order client names for craftables linked to orders
  const largeOrderIds = [
    ...new Set(craftableRows.map((c) => c.largeOrderId).filter(Boolean) as string[]),
  ];

  const clientNameMap = new Map<string, string>();
  if (largeOrderIds.length > 0) {
    const orderClientRows = await db
      .select({ orderId: largeOrders.id, clientName: clients.name })
      .from(largeOrders)
      .innerJoin(clients, eq(largeOrders.clientId, clients.id))
      .where(inArray(largeOrders.id, largeOrderIds));

    for (const r of orderClientRows) clientNameMap.set(r.orderId, r.clientName);
  }

  // 6. Build result rows, classify as today / wip, exclude fully-approved past-day ones
  const result: CraftableDashboardRow[] = [];

  for (const c of craftableRows) {
    const counts = countMap.get(c.id) ?? { total: 0, approved: 0 };
    const isToday = c.businessDayId === todayId;
    const isPastDay = !isToday && c.businessDayClosedAt !== null;

    // WIP: past day with at least one non-approved piece
    if (isPastDay && counts.total > 0 && counts.approved >= counts.total) continue;
    // Exclude past days that have no pieces at all (nothing to show)
    if (isPastDay && counts.total === 0) continue;
    // Only include today's or WIP
    if (!isToday && !isPastDay) continue;

    const pending = counts.total - counts.approved;
    const progressPct = counts.total > 0 ? Math.round((counts.approved / counts.total) * 100) : 0;

    result.push({
      id: c.id,
      businessDayId: c.businessDayId,
      businessDayOpenedAt: c.businessDayOpenedAt,
      source: c.source,
      autoApproved: c.autoApproved,
      notes: c.notes,
      createdAt: c.createdAt,
      largeOrderId: c.largeOrderId,
      largeOrderClientName: c.largeOrderId ? (clientNameMap.get(c.largeOrderId) ?? null) : null,
      totalPieces: counts.total,
      approvedPieces: counts.approved,
      pendingPieces: pending,
      progressPct,
      assignedEmployeeNames: [...(assigneeMap.get(c.id) ?? [])],
      section: isToday ? "today" : "wip",
    });
  }

  // 7. Sort: WIP first (oldest openedAt), then today's (newest createdAt)
  result.sort((a, b) => {
    if (a.section !== b.section) return a.section === "wip" ? -1 : 1;
    if (a.section === "wip")
      return a.businessDayOpenedAt.getTime() - b.businessDayOpenedAt.getTime();
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return result;
}
