/**
 * T064 — Clothier earnings computation
 *
 * Sums cloth_piece_variants.piece_rate × product_pieces.quantity for all approved
 * product pieces assigned to the employee in the given business days.
 * piece_rate is per garment: "Bata ×3" pays three times the rate (M-78).
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

/** One payroll line per approved piece row — exported for unit tests. */
export function clothierEarningsLine(
  row: Omit<ClothierEarningsLine, "earnings">,
): ClothierEarningsLine {
  return { ...row, earnings: row.pieceRate * row.quantity };
}

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
        inArray(products.businessDayId, businessDayIds),
      ),
    );

  const lines = rows.map(clothierEarningsLine);
  const totalEarnings = lines.reduce((sum, l) => sum + l.earnings, 0);

  return { employeeId, businessDayIds, totalEarnings, lines };
}
