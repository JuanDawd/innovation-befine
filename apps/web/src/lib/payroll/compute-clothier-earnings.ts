/**
 * T064 — Clothier earnings computation
 *
 * Sums cloth_piece_variants.piece_rate for all approved craftable pieces
 * assigned to the employee in the given business days.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@befine/db";
import { craftablePieces, craftables, clothPieces, clothPieceVariants } from "@befine/db/schema";

export type ClothierEarningsLine = {
  craftableId: string;
  craftablePieceId: string;
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
      craftableId: craftables.id,
      craftablePieceId: craftablePieces.id,
      pieceName: clothPieces.name,
      variantName: clothPieceVariants.name,
      pieceRate: clothPieceVariants.pieceRate,
    })
    .from(craftablePieces)
    .innerJoin(craftables, eq(craftablePieces.craftableId, craftables.id))
    .innerJoin(clothPieces, eq(craftablePieces.clothPieceId, clothPieces.id))
    .innerJoin(clothPieceVariants, eq(craftablePieces.clothPieceVariantId, clothPieceVariants.id))
    .where(
      and(
        eq(craftablePieces.assignedToEmployeeId, employeeId),
        eq(craftablePieces.status, "approved"),
        inArray(craftables.businessDayId, businessDayIds),
      ),
    );

  const lineMap = new Map<string, ClothierEarningsLine>();
  let totalEarnings = 0;

  for (const row of rows) {
    const key = `${row.craftableId}:${row.craftablePieceId}`;
    if (!lineMap.has(key)) {
      lineMap.set(key, {
        craftableId: row.craftableId,
        craftablePieceId: row.craftablePieceId,
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
