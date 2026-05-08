/**
 * Products dashboard query — Task 3.8
 *
 * getProductsDashboard returns:
 *   - Today's products (belonging to the current open business day)
 *   - WIP products (past days with ≥1 non-approved piece)
 *
 * Sort: WIP first (oldest day first), then today's (newest first).
 */

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../index";
import {
  products,
  productPieces,
  businessDays,
  employees,
  users,
  clients,
  largeOrders,
  clothPieces,
  clothPieceVariants,
  orderItems,
  clothPieceAssignments,
} from "../schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductDashboardRow = {
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
  unassignedQuantity: number;
};

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getProductsDashboard(db: Database): Promise<ProductDashboardRow[]> {
  // 1. Find the open business day id (today)
  const [openDay] = await db
    .select({ id: businessDays.id })
    .from(businessDays)
    .where(isNull(businessDays.closedAt))
    .limit(1);

  const todayId = openDay?.id ?? null;

  // 2. Fetch products: today's OR from any past day — we'll filter WIP in JS
  //    We need the business day's openedAt for sorting.
  const productRows = await db
    .select({
      id: products.id,
      businessDayId: products.businessDayId,
      businessDayOpenedAt: businessDays.openedAt,
      businessDayClosedAt: businessDays.closedAt,
      source: products.source,
      autoApproved: products.autoApproved,
      notes: products.notes,
      createdAt: products.createdAt,
      largeOrderId: products.largeOrderId,
    })
    .from(products)
    .innerJoin(businessDays, eq(products.businessDayId, businessDays.id));

  if (productRows.length === 0) return [];

  const productIds = productRows.map((c) => c.id);

  // 3. Aggregate piece counts per product
  const pieceCounts = await db
    .select({
      productId: productPieces.productId,
      total: sql<number>`coalesce(sum(${productPieces.quantity}), 0)::int`,
      approved: sql<number>`coalesce(sum(${productPieces.quantity}) filter (where ${productPieces.status} = 'approved'), 0)::int`,
    })
    .from(productPieces)
    .where(inArray(productPieces.productId, productIds))
    .groupBy(productPieces.productId);

  const countMap = new Map(
    pieceCounts.map((r) => [r.productId, { total: r.total, approved: r.approved }]),
  );

  // 4. Distinct assigned employee names per product
  const assigneeRows = await db
    .select({
      productId: productPieces.productId,
      employeeName: users.name,
    })
    .from(productPieces)
    .innerJoin(employees, eq(productPieces.assignedToEmployeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(inArray(productPieces.productId, productIds), ne(productPieces.status, "approved")));

  const assigneeMap = new Map<string, Set<string>>();
  for (const row of assigneeRows) {
    if (!assigneeMap.has(row.productId)) assigneeMap.set(row.productId, new Set());
    assigneeMap.get(row.productId)!.add(row.employeeName);
  }

  // 5. Large order client names + quantity-weighted progress for large_order products
  const largeOrderIds = [
    ...new Set(productRows.map((c) => c.largeOrderId).filter(Boolean) as string[]),
  ];

  const clientNameMap = new Map<string, string>();
  // Map: largeOrderId → { totalQty, approvedQty, totalAssigned }
  const largeOrderProgressMap = new Map<
    string,
    { totalQty: number; approvedQty: number; totalAssigned: number }
  >();

  if (largeOrderIds.length > 0) {
    const orderClientRows = await db
      .select({ orderId: largeOrders.id, clientName: clients.name })
      .from(largeOrders)
      .innerJoin(clients, eq(largeOrders.clientId, clients.id))
      .where(inArray(largeOrders.id, largeOrderIds));

    for (const r of orderClientRows) clientNameMap.set(r.orderId, r.clientName);

    // Aggregate order_items quantity, approved assignment quantity, and total assigned per large order
    const progressRows = await db
      .select({
        largeOrderId: orderItems.largeOrderId,
        totalQty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
        approvedQty: sql<number>`COALESCE(SUM(${clothPieceAssignments.approvedQuantity}), 0)::int`,
        totalAssigned: sql<number>`COALESCE(SUM(${clothPieceAssignments.assignedQuantity}), 0)::int`,
      })
      .from(orderItems)
      .leftJoin(clothPieceAssignments, eq(clothPieceAssignments.orderItemId, orderItems.id))
      .where(inArray(orderItems.largeOrderId, largeOrderIds))
      .groupBy(orderItems.largeOrderId);

    for (const r of progressRows) {
      largeOrderProgressMap.set(r.largeOrderId, {
        totalQty: Number(r.totalQty),
        approvedQty: Number(r.approvedQty),
        totalAssigned: Number(r.totalAssigned),
      });
    }
  }

  // 6. Build result rows, classify as today / wip, exclude fully-approved past-day ones
  const result: ProductDashboardRow[] = [];

  for (const c of productRows) {
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

    let progressPct: number;
    let unassignedQuantity = 0;
    if (c.source === "large_order" && c.largeOrderId) {
      const lo = largeOrderProgressMap.get(c.largeOrderId);
      progressPct = lo && lo.totalQty > 0 ? Math.round((lo.approvedQty / lo.totalQty) * 100) : 0;
      unassignedQuantity = lo ? Math.max(0, lo.totalQty - lo.totalAssigned) : 0;
    } else {
      progressPct = counts.total > 0 ? Math.round((counts.approved / counts.total) * 100) : 0;
    }

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
      unassignedQuantity,
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

// ─── Product detail ─────────────────────────────────────────────────────────

export type ProductPieceDetailRow = {
  id: string;
  clothPieceId: string;
  clothPieceName: string;
  clothPieceVariantId: string;
  clothPieceVariantName: string;
  assignedToEmployeeId: string | null;
  assignedEmployeeName: string | null;
  status: "pending" | "done_pending_approval" | "approved";
  quantity: number;
  color: string | null;
  style: string | null;
  size: string | null;
  instructions: string | null;
  version: number;
};

export type ProductDetailRow = {
  id: string;
  businessDayId: string;
  businessDayOpenedAt: Date;
  source: "manual" | "large_order";
  autoApproved: boolean;
  notes: string | null;
  createdAt: Date;
  largeOrderId: string | null;
  largeOrderClientName: string | null;
  pieces: ProductPieceDetailRow[];
};

export async function getProductDetail(
  db: Database,
  productId: string,
): Promise<ProductDetailRow | null> {
  const [product] = await db
    .select({
      id: products.id,
      businessDayId: products.businessDayId,
      businessDayOpenedAt: businessDays.openedAt,
      source: products.source,
      autoApproved: products.autoApproved,
      notes: products.notes,
      createdAt: products.createdAt,
      largeOrderId: products.largeOrderId,
    })
    .from(products)
    .innerJoin(businessDays, eq(products.businessDayId, businessDays.id))
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) return null;

  const pieceRows = await db
    .select({
      id: productPieces.id,
      clothPieceId: productPieces.clothPieceId,
      clothPieceName: clothPieces.name,
      clothPieceVariantId: productPieces.clothPieceVariantId,
      clothPieceVariantName: clothPieceVariants.name,
      assignedToEmployeeId: productPieces.assignedToEmployeeId,
      assignedEmployeeName: users.name,
      status: productPieces.status,
      quantity: productPieces.quantity,
      color: productPieces.color,
      style: productPieces.style,
      size: productPieces.size,
      instructions: productPieces.instructions,
      version: productPieces.version,
    })
    .from(productPieces)
    .innerJoin(clothPieces, eq(productPieces.clothPieceId, clothPieces.id))
    .innerJoin(clothPieceVariants, eq(productPieces.clothPieceVariantId, clothPieceVariants.id))
    .leftJoin(employees, eq(productPieces.assignedToEmployeeId, employees.id))
    .leftJoin(users, eq(employees.userId, users.id))
    .where(eq(productPieces.productId, productId))
    .orderBy(productPieces.createdAt);

  let largeOrderClientName: string | null = null;
  if (product.largeOrderId) {
    const [orderRow] = await db
      .select({ clientName: clients.name })
      .from(largeOrders)
      .innerJoin(clients, eq(largeOrders.clientId, clients.id))
      .where(eq(largeOrders.id, product.largeOrderId))
      .limit(1);
    largeOrderClientName = orderRow?.clientName ?? null;
  }

  return {
    ...product,
    largeOrderClientName,
    pieces: pieceRows.map((p) => ({
      id: p.id,
      clothPieceId: p.clothPieceId,
      clothPieceName: p.clothPieceName,
      clothPieceVariantId: p.clothPieceVariantId,
      clothPieceVariantName: p.clothPieceVariantName,
      assignedToEmployeeId: p.assignedToEmployeeId,
      assignedEmployeeName: p.assignedEmployeeName ?? null,
      status: p.status,
      quantity: p.quantity,
      color: p.color,
      style: p.style,
      size: p.size,
      instructions: p.instructions,
      version: p.version,
    })),
  };
}
