import { eq, sql } from "drizzle-orm";
import type { Database } from "../index";
import { orderItems, clothPieceAssignments, employees, users } from "../schema";

// ─── Task 4.5: getUnassignedQuantity ─────────────────────────────────────────

export async function getUnassignedQuantity(db: Database, orderItemId: string): Promise<number> {
  const [item] = await db
    .select({ quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .limit(1);

  if (!item) return 0;

  const [agg] = await db
    .select({ total: sql<number>`COALESCE(SUM(${clothPieceAssignments.assignedQuantity}), 0)` })
    .from(clothPieceAssignments)
    .where(eq(clothPieceAssignments.orderItemId, orderItemId));

  const assigned = Number(agg?.total ?? 0);
  const unassigned = item.quantity - assigned;

  if (unassigned < 0) {
    console.warn(
      `[getUnassignedQuantity] Data anomaly on orderItemId=${orderItemId}: assigned=${assigned} exceeds quantity=${item.quantity}`,
    );
    return 0;
  }

  return unassigned;
}

// ─── Task 4.10: getAssignmentProgress ────────────────────────────────────────

export type AssignmentProgressRow = {
  assignmentId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assignedQuantity: number;
  completedQuantity: number;
  approvedQuantity: number;
  progressPct: number;
  dataAnomaly: boolean;
  version: number;
};

export async function getAssignmentProgress(
  db: Database,
  orderItemId: string,
): Promise<AssignmentProgressRow[]> {
  const [item] = await db
    .select({ quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .limit(1);

  if (!item) return [];

  const rows = await db
    .select({
      assignmentId: clothPieceAssignments.id,
      assigneeId: clothPieceAssignments.assigneeId,
      assigneeName: users.name,
      assignedQuantity: clothPieceAssignments.assignedQuantity,
      completedQuantity: clothPieceAssignments.completedQuantity,
      approvedQuantity: clothPieceAssignments.approvedQuantity,
      version: clothPieceAssignments.version,
    })
    .from(clothPieceAssignments)
    .innerJoin(employees, eq(clothPieceAssignments.assigneeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(clothPieceAssignments.orderItemId, orderItemId));

  const totalAssigned = rows.reduce((sum, r) => sum + r.assignedQuantity, 0);
  const dataAnomaly = totalAssigned > item.quantity;

  if (dataAnomaly) {
    console.warn(
      `[getAssignmentProgress] Data anomaly on orderItemId=${orderItemId}: totalAssigned=${totalAssigned} > quantity=${item.quantity}`,
    );
  }

  const result: AssignmentProgressRow[] = rows.map((r) => ({
    assignmentId: r.assignmentId,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName,
    assignedQuantity: r.assignedQuantity,
    completedQuantity: r.completedQuantity,
    approvedQuantity: r.approvedQuantity,
    progressPct: item.quantity > 0 ? Math.round((r.approvedQuantity / item.quantity) * 100) : 0,
    dataAnomaly,
    version: r.version,
  }));

  const unassigned = Math.max(0, item.quantity - totalAssigned);
  if (unassigned > 0) {
    result.push({
      assignmentId: null,
      assigneeId: null,
      assigneeName: null,
      assignedQuantity: unassigned,
      completedQuantity: 0,
      approvedQuantity: 0,
      progressPct: 0,
      dataAnomaly: false,
      version: 0,
    });
  }

  return result;
}

// ─── Task 4.10/4.11: getOrderItemsWithProgress ───────────────────────────────

export type OrderItemWithProgress = {
  id: string;
  largeOrderId: string;
  clothPieceId: string;
  clothPieceVariantId: string;
  pieceName: string;
  quantity: number;
  notes: string | null;
  assignments: AssignmentProgressRow[];
};

export async function getOrderItemsWithProgress(
  db: Database,
  largeOrderId: string,
): Promise<OrderItemWithProgress[]> {
  const items = await db.select().from(orderItems).where(eq(orderItems.largeOrderId, largeOrderId));

  if (items.length === 0) return [];

  const results = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      largeOrderId: item.largeOrderId,
      clothPieceId: item.clothPieceId,
      clothPieceVariantId: item.clothPieceVariantId,
      pieceName: item.pieceName,
      quantity: item.quantity,
      notes: item.notes,
      assignments: await getAssignmentProgress(db, item.id),
    })),
  );

  return results;
}
