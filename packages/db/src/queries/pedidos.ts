/**
 * Pedido list and detail queries — T117 (spec §3.3, §3.10)
 *
 * Status, balance and per-cell progress are derived here from the production,
 * delivery and payment rows (derivePedidoStatus, summarizeCell,
 * computePedidoBalance) — never read from a stored column.
 */

import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../index";
import {
  assignments,
  clients,
  clothPieces,
  clothPieceVariants,
  deliveries,
  deliveryCells,
  employees,
  garmentColors,
  garmentSizes,
  pedidoLineCells,
  pedidoLines,
  pedidoPayments,
  pedidos,
  unitReports,
  unitReviews,
  users,
} from "../schema";
import { computePedidoBalance } from "./pedido-balance";
import {
  summarizeAssignment,
  summarizeCell,
  sumProgress,
  type AssignmentProgress,
  type CellProgress,
} from "./pedido-progress";
import { derivePedidoStatus, type PedidoStatus } from "./pedido-status";

/** A pedido is "grande" from this many units (spec §2). */
export const LARGE_PEDIDO_UNITS = 10;

/** Bogotá calendar date YYYY-MM-DD of a timestamp. */
export function bogotaDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(at);
}

export type DeliveryFlag = "overdue" | "today" | null;

/** "Atrasado" / "Para hoy" — only while the pedido still has units to hand over. */
export function deliveryFlag(
  estimatedDeliveryDate: string | null,
  status: PedidoStatus,
  destination: "client" | "inventory",
  today: string,
): DeliveryFlag {
  if (!estimatedDeliveryDate) return null;
  const done =
    status === "cancelled" ||
    status === "delivered" ||
    status === "paid" ||
    (destination === "inventory" && status === "ready");
  if (done) return null;
  if (estimatedDeliveryDate < today) return "overdue";
  if (estimatedDeliveryDate === today) return "today";
  return null;
}

// ─── List ────────────────────────────────────────────────────────────────────

export type PedidoListFilter = {
  destination?: "client" | "inventory";
  status?: PedidoStatus;
  large?: boolean;
  overdue?: boolean;
  /** Pedido number (#0412 or 412) or client name/phone */
  q?: string;
  /** "Today" in Bogotá, injectable for tests */
  today?: string;
  /** Default 500 (the list screen); Analítica reads them all */
  limit?: number;
};

export type PedidoListItem = {
  id: string;
  number: number;
  destination: "client" | "inventory";
  clientName: string | null;
  clientPhone: string | null;
  estimatedDeliveryDate: string | null;
  createdAt: Date;
  status: PedidoStatus;
  ordered: number;
  approved: number;
  delivered: number;
  total: number;
  paid: number;
  balance: number;
  saldoAFavor: number;
  isLarge: boolean;
  deliveryFlag: DeliveryFlag;
};

export async function listPedidoOverviews(
  db: Database,
  filter: PedidoListFilter = {},
): Promise<PedidoListItem[]> {
  const today = filter.today ?? bogotaDate(new Date());
  const q = filter.q?.trim();
  // "#412" is a pedido number; bare digits may be a number or part of a phone.
  const numberQuery = q && /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null;
  const textQuery = q && !q.startsWith("#") ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;

  // One row per pedido with every number the status needs (raw SQL: nested aggregates).
  const rows = await db.execute<{
    id: string;
    number: number;
    destination: "client" | "inventory";
    client_name: string | null;
    client_phone: string | null;
    estimated_delivery_at: string | null;
    cancelled_at: string | null;
    created_at: string;
    ordered: number;
    assigned: number;
    reported: number;
    approved: number;
    delivered: number;
    total: string;
    paid: string;
  }>(sql`
    WITH cell AS (
      SELECT c.id, c.quantity, l.pedido_id
      FROM pedido_line_cells c JOIN pedido_lines l ON l.id = c.line_id
    ),
    asg AS (
      SELECT a.id, a.quantity, cell.pedido_id
      FROM assignments a JOIN cell ON cell.id = a.cell_id
    ),
    rev AS (
      SELECT asg.pedido_id, sum(r.approved) AS approved, sum(r.scrapped) AS scrapped
      FROM unit_reviews r JOIN asg ON asg.id = r.assignment_id GROUP BY asg.pedido_id
    ),
    rep AS (
      SELECT asg.pedido_id, sum(r.quantity) AS reported
      FROM unit_reports r JOIN asg ON asg.id = r.assignment_id GROUP BY asg.pedido_id
    ),
    dlv AS (
      SELECT cell.pedido_id, sum(dc.quantity) AS delivered
      FROM delivery_cells dc JOIN cell ON cell.id = dc.cell_id GROUP BY cell.pedido_id
    ),
    money AS (
      SELECT l.pedido_id,
        sum(CASE WHEN l.kind = 'adjustment' THEN l.amount
          ELSE l.unit_price * coalesce((SELECT sum(c.quantity) FROM pedido_line_cells c WHERE c.line_id = l.id), 0)
        END) AS total
      FROM pedido_lines l GROUP BY l.pedido_id
    )
    SELECT p.id, p.number, p.destination, cl.name AS client_name, cl.phone AS client_phone,
      p.estimated_delivery_at, p.cancelled_at, p.created_at,
      coalesce((SELECT sum(quantity) FROM cell WHERE cell.pedido_id = p.id), 0)::int AS ordered,
      (coalesce((SELECT sum(quantity) FROM asg WHERE asg.pedido_id = p.id), 0)
        - coalesce(rev.scrapped, 0))::int AS assigned,
      coalesce(rep.reported, 0)::int AS reported,
      coalesce(rev.approved, 0)::int AS approved,
      coalesce(dlv.delivered, 0)::int AS delivered,
      coalesce(money.total, 0)::bigint AS total,
      coalesce((SELECT sum(amount) FROM pedido_payments pp WHERE pp.pedido_id = p.id), 0)::bigint AS paid
    FROM pedidos p
    LEFT JOIN clients cl ON cl.id = p.client_id
    LEFT JOIN rev ON rev.pedido_id = p.id
    LEFT JOIN rep ON rep.pedido_id = p.id
    LEFT JOIN dlv ON dlv.pedido_id = p.id
    LEFT JOIN money ON money.pedido_id = p.id
    WHERE true
      ${filter.destination ? sql`AND p.destination = ${filter.destination}` : sql``}
      ${
        numberQuery !== null && textQuery
          ? sql`AND (p.number = ${numberQuery} OR cl.phone ILIKE ${textQuery})`
          : numberQuery !== null
            ? sql`AND p.number = ${numberQuery}`
            : textQuery
              ? sql`AND (cl.name ILIKE ${textQuery} OR cl.phone ILIKE ${textQuery})`
              : sql``
      }
    ORDER BY p.number DESC
    LIMIT ${filter.limit ?? 500}
  `);

  return rows.rows
    .map((r): PedidoListItem => {
      const total = Number(r.total);
      // Cancelled: nothing is owed any more and everything paid is owed back.
      const money = computePedidoBalance(r.cancelled_at !== null ? 0 : total, [
        { amount: Number(r.paid) },
      ]);
      const estimatedDeliveryDate = r.estimated_delivery_at
        ? bogotaDate(new Date(r.estimated_delivery_at))
        : null;
      const { status } = derivePedidoStatus({
        destination: r.destination,
        cancelled: r.cancelled_at !== null,
        progress: {
          ordered: Number(r.ordered),
          assigned: Number(r.assigned),
          reported: Number(r.reported),
          approved: Number(r.approved),
          delivered: Number(r.delivered),
        },
        balance: money.balance,
      });
      return {
        id: r.id,
        number: Number(r.number),
        destination: r.destination,
        clientName: r.client_name,
        clientPhone: r.client_phone,
        estimatedDeliveryDate,
        createdAt: new Date(r.created_at),
        status,
        ordered: Number(r.ordered),
        approved: Number(r.approved),
        delivered: Number(r.delivered),
        total,
        paid: money.paid,
        balance: money.balance,
        saldoAFavor: money.saldoAFavor,
        isLarge: Number(r.ordered) >= LARGE_PEDIDO_UNITS,
        deliveryFlag: deliveryFlag(estimatedDeliveryDate, status, r.destination, today),
      };
    })
    .filter(
      (p) =>
        (!filter.status || p.status === filter.status) &&
        (!filter.large || p.isLarge) &&
        (!filter.overdue || p.deliveryFlag === "overdue"),
    );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

export type PedidoDetailCell = {
  id: string;
  sizeId: string | null;
  sizeLabel: string;
  sizeSortOrder: number;
  progress: CellProgress;
};

export type PedidoDetailAssignment = {
  id: string;
  cellId: string;
  sizeLabel: string;
  employeeId: string;
  employeeName: string;
  source: "assigned" | "claimed";
  /** null when redacted for a role that may not see clothier pay (secretary) */
  pieceRate: number | null;
  rateReason: string | null;
  version: number;
  progress: AssignmentProgress;
};

export type PedidoDetailLine =
  | {
      kind: "garment";
      id: string;
      pieceName: string;
      variantName: string;
      colorLabel: string | null;
      colorHex: string | null;
      style: string | null;
      instructions: string | null;
      unitPrice: number;
      priceReason: string | null;
      /** Catalog piece rate of the variant; null when redacted (secretary) */
      variantPieceRate: number | null;
      cells: PedidoDetailCell[];
      progress: CellProgress;
      total: number;
      /** Who holds units of this line (T122) — rates are hidden from the secretary by the caller */
      assignments: PedidoDetailAssignment[];
      /** Last spec change while in production (T119) */
      specChange: { summary: string; reason: string } | null;
    }
  | { kind: "adjustment"; id: string; amount: number; reason: string };

export type PedidoDetail = {
  id: string;
  number: number;
  version: number;
  destination: "client" | "inventory";
  client: { id: string; name: string; phone: string | null } | null;
  estimatedDeliveryDate: string | null;
  notes: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  createdByName: string | null;
  lines: PedidoDetailLine[];
  progress: CellProgress;
  status: PedidoStatus;
  deliveryFlag: DeliveryFlag;
  total: number;
  paid: number;
  balance: number;
  saldoAFavor: number;
  payments: {
    id: string;
    amount: number;
    method: "cash" | "card" | "transfer";
    receivedAt: Date;
    afterHours: boolean;
    note: string | null;
    recordedByName: string | null;
  }[];
  deliveries: {
    id: string;
    deliveredAt: Date;
    deliveredByName: string | null;
    note: string | null;
    units: number;
  }[];
};

export async function getPedidoDetail(
  db: Database,
  id: string,
  today: string = bogotaDate(new Date()),
): Promise<PedidoDetail | null> {
  const [pedido] = await db
    .select({
      id: pedidos.id,
      number: pedidos.number,
      version: pedidos.version,
      destination: pedidos.destination,
      clientId: clients.id,
      clientName: clients.name,
      clientPhone: clients.phone,
      estimatedDeliveryAt: pedidos.estimatedDeliveryAt,
      notes: pedidos.notes,
      cancelledAt: pedidos.cancelledAt,
      cancellationReason: pedidos.cancellationReason,
      createdAt: pedidos.createdAt,
      createdByName: users.name,
    })
    .from(pedidos)
    .leftJoin(clients, eq(pedidos.clientId, clients.id))
    .leftJoin(employees, eq(pedidos.createdBy, employees.id))
    .leftJoin(users, eq(employees.userId, users.id))
    .where(eq(pedidos.id, id))
    .limit(1);
  if (!pedido) return null;

  const lineRows = await db
    .select({
      id: pedidoLines.id,
      kind: pedidoLines.kind,
      pieceName: clothPieces.name,
      variantName: clothPieceVariants.name,
      variantPieceRate: clothPieceVariants.pieceRate,
      colorLabel: garmentColors.label,
      colorHex: garmentColors.hex,
      colorOther: pedidoLines.colorOther,
      style: pedidoLines.style,
      instructions: pedidoLines.instructions,
      unitPrice: pedidoLines.unitPrice,
      priceReason: pedidoLines.priceReason,
      amount: pedidoLines.amount,
      specChange: pedidoLines.specChange,
    })
    .from(pedidoLines)
    .leftJoin(clothPieceVariants, eq(pedidoLines.clothPieceVariantId, clothPieceVariants.id))
    .leftJoin(clothPieces, eq(clothPieceVariants.clothPieceId, clothPieces.id))
    .leftJoin(garmentColors, eq(pedidoLines.colorId, garmentColors.id))
    .where(eq(pedidoLines.pedidoId, id))
    .orderBy(asc(pedidoLines.position));

  const lineIds = lineRows.map((l) => l.id);
  const cellRows = lineIds.length
    ? await db
        .select({
          id: pedidoLineCells.id,
          lineId: pedidoLineCells.lineId,
          sizeId: pedidoLineCells.sizeId,
          sizeLabel: garmentSizes.label,
          sizeSortOrder: garmentSizes.sortOrder,
          sizeOther: pedidoLineCells.sizeOther,
          quantity: pedidoLineCells.quantity,
        })
        .from(pedidoLineCells)
        .leftJoin(garmentSizes, eq(pedidoLineCells.sizeId, garmentSizes.id))
        .where(inArray(pedidoLineCells.lineId, lineIds))
    : [];
  const cellIds = cellRows.map((c) => c.id);

  const assignmentRows = cellIds.length
    ? await db
        .select({
          id: assignments.id,
          cellId: assignments.cellId,
          quantity: assignments.quantity,
          employeeId: assignments.employeeId,
          employeeName: users.name,
          source: assignments.source,
          pieceRate: assignments.pieceRate,
          rateReason: assignments.rateReason,
          version: assignments.version,
        })
        .from(assignments)
        .leftJoin(employees, eq(assignments.employeeId, employees.id))
        .leftJoin(users, eq(employees.userId, users.id))
        .where(inArray(assignments.cellId, cellIds))
        .orderBy(asc(assignments.createdAt))
    : [];
  const assignmentIds = assignmentRows.map((a) => a.id);
  const [reportRows, reviewRows, deliveredRows, paymentRows, deliveryRows] = await Promise.all([
    assignmentIds.length
      ? db
          .select({
            assignmentId: unitReports.assignmentId,
            quantity: unitReports.quantity,
            kind: unitReports.kind,
          })
          .from(unitReports)
          .where(inArray(unitReports.assignmentId, assignmentIds))
      : [],
    assignmentIds.length
      ? db
          .select({
            assignmentId: unitReviews.assignmentId,
            approved: unitReviews.approved,
            returned: unitReviews.returned,
            scrapped: unitReviews.scrapped,
          })
          .from(unitReviews)
          .where(inArray(unitReviews.assignmentId, assignmentIds))
      : [],
    cellIds.length
      ? db
          .select({ cellId: deliveryCells.cellId, quantity: deliveryCells.quantity })
          .from(deliveryCells)
          .where(inArray(deliveryCells.cellId, cellIds))
      : [],
    db
      .select({
        id: pedidoPayments.id,
        amount: pedidoPayments.amount,
        method: pedidoPayments.method,
        receivedAt: pedidoPayments.receivedAt,
        afterHours: pedidoPayments.afterHours,
        note: pedidoPayments.note,
        recordedByName: users.name,
      })
      .from(pedidoPayments)
      .leftJoin(employees, eq(pedidoPayments.recordedBy, employees.id))
      .leftJoin(users, eq(employees.userId, users.id))
      .where(eq(pedidoPayments.pedidoId, id))
      .orderBy(asc(pedidoPayments.receivedAt)),
    db
      .select({
        id: deliveries.id,
        deliveredAt: deliveries.deliveredAt,
        note: deliveries.note,
        deliveredByName: users.name,
        units: sql<number>`coalesce((SELECT sum(${deliveryCells.quantity}) FROM ${deliveryCells} WHERE ${deliveryCells.deliveryId} = ${deliveries.id}), 0)::int`,
      })
      .from(deliveries)
      .leftJoin(employees, eq(deliveries.deliveredBy, employees.id))
      .leftJoin(users, eq(employees.userId, users.id))
      .where(eq(deliveries.pedidoId, id))
      .orderBy(desc(deliveries.deliveredAt)),
  ]);

  const cellProgress = (cellId: string, quantity: number) =>
    summarizeCell({
      quantity,
      assignments: assignmentRows
        .filter((a) => a.cellId === cellId)
        .map((a) => ({
          quantity: a.quantity,
          reports: reportRows.filter((r) => r.assignmentId === a.id),
          reviews: reviewRows.filter((r) => r.assignmentId === a.id),
        })),
      deliveries: deliveredRows.filter((d) => d.cellId === cellId),
    });

  const lines: PedidoDetailLine[] = lineRows.map((l) => {
    if (l.kind === "adjustment")
      return { kind: "adjustment", id: l.id, amount: l.amount!, reason: l.priceReason! };
    const cells = cellRows
      .filter((c) => c.lineId === l.id)
      .map((c) => ({
        id: c.id,
        sizeId: c.sizeId,
        sizeLabel: c.sizeLabel ?? c.sizeOther ?? "—",
        // Free-text sizes go after the list sizes.
        sizeSortOrder: c.sizeSortOrder ?? Number.MAX_SAFE_INTEGER,
        progress: cellProgress(c.id, c.quantity),
      }))
      .sort((a, b) => a.sizeSortOrder - b.sizeSortOrder || a.sizeLabel.localeCompare(b.sizeLabel));
    const progress = sumProgress(cells.map((c) => c.progress));
    const cellLabel = new Map(cells.map((c) => [c.id, c.sizeLabel]));
    const lineAssignments = assignmentRows
      .filter((a) => cellLabel.has(a.cellId))
      .map((a) => ({
        id: a.id,
        cellId: a.cellId,
        sizeLabel: cellLabel.get(a.cellId)!,
        employeeId: a.employeeId,
        employeeName: a.employeeName ?? "—",
        source: a.source,
        pieceRate: a.pieceRate,
        rateReason: a.rateReason,
        version: a.version,
        progress: summarizeAssignment({
          quantity: a.quantity,
          reports: reportRows.filter((r) => r.assignmentId === a.id),
          reviews: reviewRows.filter((r) => r.assignmentId === a.id),
        }),
      }))
      // Fully released assignments with no work left are history only.
      .filter((a) => a.progress.live > 0 || a.progress.reported + a.progress.rework > 0);
    return {
      kind: "garment",
      id: l.id,
      pieceName: l.pieceName ?? "—",
      variantName: l.variantName ?? "—",
      colorLabel: l.colorLabel ?? l.colorOther,
      colorHex: l.colorHex,
      style: l.style,
      instructions: l.instructions,
      unitPrice: l.unitPrice!,
      priceReason: l.priceReason,
      variantPieceRate: l.variantPieceRate,
      cells,
      progress,
      total: l.unitPrice! * progress.ordered,
      assignments: lineAssignments,
      specChange: (l.specChange as { summary: string; reason: string } | null) ?? null,
    };
  });

  const progress = sumProgress(lines.flatMap((l) => (l.kind === "garment" ? [l.progress] : [])));
  const total = lines.reduce((t, l) => t + (l.kind === "garment" ? l.total : l.amount), 0);
  // Cancelled: nothing is owed any more and everything paid is owed back.
  const money = computePedidoBalance(pedido.cancelledAt !== null ? 0 : total, paymentRows);
  const estimatedDeliveryDate = pedido.estimatedDeliveryAt
    ? bogotaDate(pedido.estimatedDeliveryAt)
    : null;
  const { status } = derivePedidoStatus({
    destination: pedido.destination,
    cancelled: pedido.cancelledAt !== null,
    progress,
    balance: money.balance,
  });

  return {
    id: pedido.id,
    number: pedido.number,
    version: pedido.version,
    destination: pedido.destination,
    client: pedido.clientId
      ? { id: pedido.clientId, name: pedido.clientName!, phone: pedido.clientPhone }
      : null,
    estimatedDeliveryDate,
    notes: pedido.notes,
    cancelledAt: pedido.cancelledAt,
    cancellationReason: pedido.cancellationReason,
    createdAt: pedido.createdAt,
    createdByName: pedido.createdByName,
    lines,
    progress,
    status,
    deliveryFlag: deliveryFlag(estimatedDeliveryDate, status, pedido.destination, today),
    total,
    paid: money.paid,
    balance: money.balance,
    saldoAFavor: money.saldoAFavor,
    payments: paymentRows,
    deliveries: deliveryRows.map((d) => ({ ...d, units: Number(d.units) })),
  };
}
