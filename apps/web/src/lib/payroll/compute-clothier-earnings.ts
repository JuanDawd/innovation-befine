/**
 * T064 — Clothier earnings computation
 *
 * Sums cloth_piece_variants.piece_rate for all approved batch pieces
 * assigned to the employee in the given business days.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@befine/db";
import { batchPieces, clothBatches, clothPieces, clothPieceVariants } from "@befine/db/schema";

export type ClothierEarningsLine = {
  batchId: string;
  batchPieceId: string;
  pieceName: string;
  variantName: string;
  quantity: number;
  pieceRate: number;
  earnings: number;
};

export type ClothierEarningsResult = {
  employeeId: string;
  businessDayIds: string[];
  totalEarnings: number;
  lines: ClothierEarningsLine[];
};

export async function computeClothierEarnings(
  db: Database,
  employeeId: string,
  businessDayIds: string[],
): Promise<ClothierEarningsResult> {
  if (businessDayIds.length === 0)
    return { employeeId, businessDayIds, totalEarnings: 0, lines: [] };

  const rows = await db
    .select({
      batchId: clothBatches.id,
      batchPieceId: batchPieces.id,
      pieceName: clothPieces.name,
      variantName: clothPieceVariants.name,
      pieceRate: clothPieceVariants.pieceRate,
    })
    .from(batchPieces)
    .innerJoin(clothBatches, eq(batchPieces.batchId, clothBatches.id))
    .innerJoin(clothPieces, eq(batchPieces.clothPieceId, clothPieces.id))
    .innerJoin(clothPieceVariants, eq(batchPieces.clothPieceVariantId, clothPieceVariants.id))
    .where(
      and(
        eq(batchPieces.assignedToEmployeeId, employeeId),
        eq(batchPieces.status, "approved"),
        inArray(clothBatches.businessDayId, businessDayIds),
      ),
    );

  const lineMap = new Map<string, ClothierEarningsLine>();
  let totalEarnings = 0;

  for (const row of rows) {
    const key = `${row.batchId}:${row.batchPieceId}`;
    if (!lineMap.has(key)) {
      lineMap.set(key, {
        batchId: row.batchId,
        batchPieceId: row.batchPieceId,
        pieceName: row.pieceName,
        variantName: row.variantName,
        quantity: 0,
        pieceRate: row.pieceRate,
        earnings: 0,
      });
    }
    const line = lineMap.get(key)!;
    line.quantity += 1;
    line.earnings += row.pieceRate;
    totalEarnings += row.pieceRate;
  }

  return { employeeId, businessDayIds, totalEarnings, lines: Array.from(lineMap.values()) };
}
