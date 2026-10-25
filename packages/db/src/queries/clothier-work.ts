/**
 * Mi trabajo — T123 (spec §3.2, §3.10)
 *
 * Everything one clothier needs on her phone, and nothing else: her pay rate
 * per unit, never client prices or client names.
 *
 *   corrections  assignments with returned units still to redo (shown first)
 *   work         assignments with units to make, nearest delivery first
 *   available    sizes with unassigned units she may claim — client pedidos
 *                before inventory, then by delivery date
 *   held         unstarted units she holds, for the claim limit
 */

import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../index";
import {
  assignments,
  clothPieces,
  clothPieceVariants,
  garmentColors,
  garmentSizes,
  pedidoLineCells,
  pedidoLines,
  pedidos,
  unitReports,
  unitReviews,
} from "../schema";
import { summarizeAssignment, type AssignmentProgress } from "./pedido-progress";
import { bogotaDate, deliveryFlag, type DeliveryFlag } from "./pedidos";

export type WorkItem = {
  assignmentId: string;
  version: number;
  pedidoNumber: number;
  destination: "client" | "inventory";
  garment: string;
  color: string | null;
  style: string | null;
  instructions: string | null;
  sizeLabel: string;
  pieceRate: number;
  rateReason: string | null;
  source: "assigned" | "claimed";
  estimatedDeliveryDate: string | null;
  deliveryFlag: DeliveryFlag;
  progress: AssignmentProgress;
  /** Units she still has to make: unstarted + returned for rework */
  toDo: number;
  /** Latest reason her units were returned */
  returnReason: string | null;
  specChange: { summary: string; reason: string; at: string } | null;
  /** Nothing reported yet: she may give units back herself */
  canRelease: boolean;
};

export type AvailableItem = {
  cellId: string;
  pedidoNumber: number;
  destination: "client" | "inventory";
  garment: string;
  color: string | null;
  style: string | null;
  instructions: string | null;
  sizeLabel: string;
  unassigned: number;
  pieceRate: number;
  estimatedDeliveryDate: string | null;
  deliveryFlag: DeliveryFlag;
};

export type ClothierWork = {
  corrections: WorkItem[];
  work: WorkItem[];
  available: AvailableItem[];
  /** Unstarted units she holds (counted against the claim limit) */
  held: number;
  /** Units reported and waiting for review */
  pendingReview: number;
};

const garmentName = sql<string>`${clothPieces.name} || ' — ' || ${clothPieceVariants.name}`;
const sizeName = sql<string>`coalesce(${garmentSizes.label}, ${pedidoLineCells.sizeOther})`;
const colorName = sql<string | null>`coalesce(${garmentColors.label}, ${pedidoLines.colorOther})`;

export async function getClothierWork(
  db: Database,
  employeeId: string,
  today: string = bogotaDate(new Date()),
): Promise<ClothierWork> {
  const mine = await db
    .select({
      assignmentId: assignments.id,
      version: assignments.version,
      quantity: assignments.quantity,
      pieceRate: assignments.pieceRate,
      rateReason: assignments.rateReason,
      source: assignments.source,
      pedidoNumber: pedidos.number,
      destination: pedidos.destination,
      estimatedDeliveryAt: pedidos.estimatedDeliveryAt,
      garment: garmentName,
      color: colorName,
      style: pedidoLines.style,
      instructions: pedidoLines.instructions,
      specChange: pedidoLines.specChange,
      specChangedAt: pedidoLines.specChangedAt,
      sizeLabel: sizeName,
      sizeOrder: garmentSizes.sortOrder,
    })
    .from(assignments)
    .innerJoin(pedidoLineCells, eq(assignments.cellId, pedidoLineCells.id))
    .innerJoin(pedidoLines, eq(pedidoLineCells.lineId, pedidoLines.id))
    .innerJoin(pedidos, eq(pedidoLines.pedidoId, pedidos.id))
    .innerJoin(clothPieceVariants, eq(pedidoLines.clothPieceVariantId, clothPieceVariants.id))
    .innerJoin(clothPieces, eq(clothPieceVariants.clothPieceId, clothPieces.id))
    .leftJoin(garmentSizes, eq(pedidoLineCells.sizeId, garmentSizes.id))
    .leftJoin(garmentColors, eq(pedidoLines.colorId, garmentColors.id))
    .where(sql`${assignments.employeeId} = ${employeeId} AND ${pedidos.cancelledAt} IS NULL`);

  const ids = mine.map((m) => m.assignmentId);
  const [reports, reviews] = await Promise.all([
    ids.length
      ? db
          .select({
            assignmentId: unitReports.assignmentId,
            quantity: unitReports.quantity,
            kind: unitReports.kind,
          })
          .from(unitReports)
          .where(inArray(unitReports.assignmentId, ids))
      : [],
    ids.length
      ? db
          .select({
            assignmentId: unitReviews.assignmentId,
            approved: unitReviews.approved,
            returned: unitReviews.returned,
            scrapped: unitReviews.scrapped,
            reason: unitReviews.reason,
            createdAt: unitReviews.createdAt,
          })
          .from(unitReviews)
          .where(inArray(unitReviews.assignmentId, ids))
          .orderBy(asc(unitReviews.createdAt))
      : [],
  ]);

  const items: (WorkItem & { sizeOrder: number })[] = mine.map((m) => {
    const myReports = reports.filter((r) => r.assignmentId === m.assignmentId);
    const myReviews = reviews.filter((r) => r.assignmentId === m.assignmentId);
    const progress = summarizeAssignment({
      quantity: m.quantity,
      reports: myReports,
      reviews: myReviews,
    });
    const lastReturn = [...myReviews].reverse().find((r) => r.returned > 0);
    const estimatedDeliveryDate = m.estimatedDeliveryAt ? bogotaDate(m.estimatedDeliveryAt) : null;
    const spec = m.specChange as { summary: string; reason: string } | null;
    return {
      assignmentId: m.assignmentId,
      version: m.version,
      pedidoNumber: m.pedidoNumber,
      destination: m.destination,
      garment: m.garment,
      color: m.color,
      style: m.style,
      instructions: m.instructions,
      sizeLabel: m.sizeLabel,
      sizeOrder: m.sizeOrder ?? Number.MAX_SAFE_INTEGER,
      pieceRate: m.pieceRate,
      rateReason: m.rateReason,
      source: m.source,
      estimatedDeliveryDate,
      // Her units are what is late or due, whatever the pedido's own status.
      deliveryFlag: deliveryFlag(estimatedDeliveryDate, "in_production", m.destination, today),
      progress,
      toDo: progress.unstarted + progress.inRework,
      returnReason: progress.inRework > 0 ? (lastReturn?.reason ?? null) : null,
      specChange: spec && m.specChangedAt ? { ...spec, at: m.specChangedAt.toISOString() } : null,
      canRelease: myReports.length === 0 && progress.unstarted > 0,
    };
  });

  const byDate = (a: { estimatedDeliveryDate: string | null; pedidoNumber: number }, b: typeof a) =>
    (a.estimatedDeliveryDate ?? "9999").localeCompare(b.estimatedDeliveryDate ?? "9999") ||
    a.pedidoNumber - b.pedidoNumber;
  const strip = ({ sizeOrder, ...rest }: (typeof items)[number]): WorkItem => {
    void sizeOrder;
    return rest;
  };

  const corrections = items
    .filter((i) => i.progress.inRework > 0)
    .sort(byDate)
    .map(strip);
  const work = items
    .filter((i) => i.progress.inRework === 0 && i.toDo > 0)
    .sort((a, b) => byDate(a, b) || a.sizeOrder - b.sizeOrder)
    .map(strip);

  const availableRows = await db.execute<{
    cell_id: string;
    pedido_number: number;
    destination: "client" | "inventory";
    garment: string;
    color: string | null;
    style: string | null;
    instructions: string | null;
    size_label: string;
    size_order: number | null;
    unassigned: number;
    piece_rate: string;
    estimated_delivery_at: string | null;
  }>(sql`
    SELECT c.id AS cell_id, p.number AS pedido_number, p.destination,
      cp.name || ' — ' || v.name AS garment,
      coalesce(gc.label, l.color_other) AS color, l.style, l.instructions,
      coalesce(gs.label, c.size_other) AS size_label, gs.sort_order AS size_order,
      (c.quantity
        - coalesce((SELECT sum(a.quantity) FROM assignments a WHERE a.cell_id = c.id), 0)
        + coalesce((SELECT sum(r.scrapped) FROM unit_reviews r JOIN assignments a ON a.id = r.assignment_id WHERE a.cell_id = c.id), 0)
      )::int AS unassigned,
      v.piece_rate, p.estimated_delivery_at
    FROM pedido_line_cells c
    JOIN pedido_lines l ON l.id = c.line_id
    JOIN pedidos p ON p.id = l.pedido_id
    JOIN cloth_piece_variants v ON v.id = l.cloth_piece_variant_id
    JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
    LEFT JOIN garment_sizes gs ON gs.id = c.size_id
    LEFT JOIN garment_colors gc ON gc.id = l.color_id
    WHERE p.cancelled_at IS NULL
  `);
  const available: AvailableItem[] = (availableRows.rows as typeof availableRows.rows)
    .filter((r) => Number(r.unassigned) > 0)
    .map((r) => {
      const estimatedDeliveryDate = r.estimated_delivery_at
        ? bogotaDate(new Date(r.estimated_delivery_at))
        : null;
      return {
        cellId: r.cell_id,
        pedidoNumber: Number(r.pedido_number),
        destination: r.destination,
        garment: r.garment,
        color: r.color,
        style: r.style,
        instructions: r.instructions,
        sizeLabel: r.size_label,
        unassigned: Number(r.unassigned),
        pieceRate: Number(r.piece_rate),
        estimatedDeliveryDate,
        deliveryFlag: deliveryFlag(estimatedDeliveryDate, "in_production", r.destination, today),
        sizeOrder: r.size_order ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort(
      (a, b) =>
        (a.destination === b.destination ? 0 : a.destination === "client" ? -1 : 1) ||
        byDate(a, b) ||
        a.sizeOrder - b.sizeOrder,
    )
    .map(({ sizeOrder, ...rest }) => {
      void sizeOrder;
      return rest;
    });

  return {
    corrections,
    work,
    available,
    held: items.reduce((n, i) => n + i.progress.unstarted, 0),
    pendingReview: items.reduce((n, i) => n + i.progress.pendingReview, 0),
  };
}
