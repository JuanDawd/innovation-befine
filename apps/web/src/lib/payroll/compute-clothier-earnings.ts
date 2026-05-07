/**
 * T064 — Clothier earnings computation
 *
 * Sums cloth_piece_variants.piece_rate for all approved product pieces
 * assigned to the employee in the given business days.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@befine/db";
import { productPieces, products, clothPieces, clothPieceVariants } from "@befine/db/schema";

export type ClothierEarningsLine = {
  productId: string;
  productPieceId: string;
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
      productId: products.id,
      productPieceId: productPieces.id,
      pieceName: clothPieces.name,
      variantName: clothPieceVariants.name,
      pieceRate: clothPieceVariants.pieceRate,
    })
    .from(productPieces)
    .innerJoin(products, eq(productPieces.productId, products.id))
    .innerJoin(clothPieces, eq(productPieces.clothPieceId, clothPieces.id))
    .innerJoin(clothPieceVariants, eq(productPieces.clothPieceVariantId, clothPieceVariants.id))
    .where(
      and(
        eq(productPieces.assignedToEmployeeId, employeeId),
        eq(productPieces.status, "approved"),
        inArray(products.businessDayId, businessDayIds),
      ),
    );

  const lineMap = new Map<string, ClothierEarningsLine>();
  let totalEarnings = 0;

  for (const row of rows) {
    const key = `${row.productId}:${row.productPieceId}`;
    if (!lineMap.has(key)) {
      lineMap.set(key, {
        productId: row.productId,
        productPieceId: row.productPieceId,
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
