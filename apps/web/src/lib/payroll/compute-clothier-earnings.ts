/**
 * Clothier earnings — T064, rewritten for pedidos by T126 (spec §3.2.10–12)
 *
 * Pay = approved units × the assignment's rate, on the business day of the
 * review that approved them. Scrapped units are added only when that review
 * was marked paid (scrap_paid, copied from the setting at review time).
 * Returned units earn nothing until their rework is approved, so a correction
 * is paid exactly once. Units later moved out of a pedido by a restructure
 * stay paid: the review rows do not change.
 *
 * Product pieces from the previous model are still included (labelled
 * "producto") until T135 retires that model.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@befine/db";
import {
  assignments,
  clothPieces,
  clothPieceVariants,
  garmentSizes,
  pedidoLineCells,
  pedidoLines,
  pedidos,
  productPieces,
  products,
  unitReviews,
} from "@befine/db/schema";

export type ClothierEarningsLine = {
  businessDayId: string;
  pieceName: string;
  variantName: string;
  quantity: number;
  pieceRate: number;
  earnings: number;
  /** "pedido" (T126) or "producto" (previous model, until T135) */
  source: "pedido" | "producto";
  /** pedido lines: approved units, or scrapped units paid by the setting */
  kind: "approved" | "scrapped";
  pedidoNumber: number | null;
  sizeLabel: string | null;
  /** Why this assignment has a special rate */
  rateReason: string | null;
  /** Reviews this line pays (pedido lines) — linked to the payout */
  unitReviewIds: string[];
  /** Previous model only */
  productId?: string;
  productPieceId?: string;
};

export type ClothierEarningsResult = {
  employeeId: string;
  businessDayIds: string[];
  totalEarnings: number;
  lines: ClothierEarningsLine[];
};

export type ClothierReviewRow = {
  reviewId: string;
  businessDayId: string;
  assignmentId: string;
  pedidoNumber: number;
  pieceName: string;
  variantName: string;
  sizeLabel: string;
  pieceRate: number;
  rateReason: string | null;
  approved: number;
  scrapped: number;
  scrapPaid: boolean;
};

/**
 * Pure: one line per (day, assignment, kind) from the review rows. Exported
 * for unit tests — every peso is explainable as units × rate.
 */
export function pedidoEarningsLines(rows: ClothierReviewRow[]): ClothierEarningsLine[] {
  const lines = new Map<string, ClothierEarningsLine>();
  const add = (row: ClothierReviewRow, kind: "approved" | "scrapped", units: number) => {
    if (units <= 0) return;
    const key = `${row.businessDayId}:${row.assignmentId}:${kind}`;
    const line =
      lines.get(key) ??
      ({
        businessDayId: row.businessDayId,
        pieceName: row.pieceName,
        variantName: row.variantName,
        quantity: 0,
        pieceRate: row.pieceRate,
        earnings: 0,
        source: "pedido",
        kind,
        pedidoNumber: row.pedidoNumber,
        sizeLabel: row.sizeLabel,
        rateReason: row.rateReason,
        unitReviewIds: [],
      } satisfies ClothierEarningsLine);
    line.quantity += units;
    line.earnings = line.quantity * line.pieceRate;
    if (!line.unitReviewIds.includes(row.reviewId)) line.unitReviewIds.push(row.reviewId);
    lines.set(key, line);
  };
  for (const row of rows) {
    add(row, "approved", row.approved);
    if (row.scrapPaid) add(row, "scrapped", row.scrapped);
  }
  return [...lines.values()].sort(
    (a, b) =>
      a.businessDayId.localeCompare(b.businessDayId) ||
      (a.pedidoNumber ?? 0) - (b.pedidoNumber ?? 0) ||
      (a.sizeLabel ?? "").localeCompare(b.sizeLabel ?? "") ||
      a.kind.localeCompare(b.kind),
  );
}

/**
 * The unit reviews a payout pays, each once. A review with approved units and
 * paid scraps sits on two lines; linking it twice would break the payout.
 */
export function payoutReviewIds(lines: ClothierEarningsLine[]): string[] {
  return [...new Set(lines.flatMap((l) => l.unitReviewIds))];
}

/** One payroll line per approved product piece (previous model) — kept for unit tests. */
export function clothierEarningsLine(row: {
  productId: string;
  businessDayId: string;
  productPieceId: string;
  pieceName: string;
  variantName: string;
  quantity: number;
  pieceRate: number;
}): ClothierEarningsLine {
  return {
    ...row,
    earnings: row.pieceRate * row.quantity,
    source: "producto",
    kind: "approved",
    pedidoNumber: null,
    sizeLabel: null,
    rateReason: null,
    unitReviewIds: [],
  };
}

export async function computeClothierEarnings(
  db: Database,
  employeeId: string,
  businessDayIds: string[],
): Promise<ClothierEarningsResult> {
  if (businessDayIds.length === 0)
    return { employeeId, businessDayIds, totalEarnings: 0, lines: [] };

  const [reviewRows, pieceRows] = await Promise.all([
    db
      .select({
        reviewId: unitReviews.id,
        businessDayId: unitReviews.businessDayId,
        assignmentId: assignments.id,
        pedidoNumber: pedidos.number,
        pieceName: clothPieces.name,
        variantName: clothPieceVariants.name,
        sizeLabel: garmentSizes.label,
        sizeOther: pedidoLineCells.sizeOther,
        pieceRate: assignments.pieceRate,
        rateReason: assignments.rateReason,
        approved: unitReviews.approved,
        scrapped: unitReviews.scrapped,
        scrapPaid: unitReviews.scrapPaid,
      })
      .from(unitReviews)
      .innerJoin(assignments, eq(unitReviews.assignmentId, assignments.id))
      .innerJoin(pedidoLineCells, eq(assignments.cellId, pedidoLineCells.id))
      .innerJoin(pedidoLines, eq(pedidoLineCells.lineId, pedidoLines.id))
      .innerJoin(pedidos, eq(pedidoLines.pedidoId, pedidos.id))
      .innerJoin(clothPieceVariants, eq(pedidoLines.clothPieceVariantId, clothPieceVariants.id))
      .innerJoin(clothPieces, eq(clothPieceVariants.clothPieceId, clothPieces.id))
      .leftJoin(garmentSizes, eq(pedidoLineCells.sizeId, garmentSizes.id))
      .where(
        and(
          eq(assignments.employeeId, employeeId),
          inArray(unitReviews.businessDayId, businessDayIds),
        ),
      ),
    db
      .select({
        productId: products.id,
        businessDayId: productPieces.approvedBusinessDayId,
        productPieceId: productPieces.id,
        pieceName: clothPieces.name,
        variantName: clothPieceVariants.name,
        pieceRate: clothPieceVariants.pieceRate,
        quantity: productPieces.quantity,
      })
      .from(productPieces)
      .innerJoin(products, eq(productPieces.productId, products.id))
      .innerJoin(clothPieces, eq(productPieces.clothPieceId, clothPieces.id))
      .innerJoin(clothPieceVariants, eq(productPieces.clothPieceVariantId, clothPieceVariants.id))
      .where(
        and(
          eq(productPieces.assignedToEmployeeId, employeeId),
          eq(productPieces.status, "approved"),
          // H-57: pay belongs to the day the piece was approved
          inArray(productPieces.approvedBusinessDayId, businessDayIds),
        ),
      ),
  ]);

  const lines = [
    ...pedidoEarningsLines(
      reviewRows.map((r) => ({ ...r, sizeLabel: r.sizeLabel ?? r.sizeOther ?? "—" })),
    ),
    // Filtered by approval day above, so it is always set
    ...pieceRows.map((r) => clothierEarningsLine({ ...r, businessDayId: r.businessDayId! })),
  ];
  const totalEarnings = lines.reduce((sum, l) => sum + l.earnings, 0);
  return { employeeId, businessDayIds, totalEarnings, lines };
}
