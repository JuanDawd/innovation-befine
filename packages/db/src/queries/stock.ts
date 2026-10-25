/**
 * Stock on hand — T113 (spec §3.6)
 *
 * Available units per variant + size + colour = Σ stock_movements.quantity.
 * Never a column. Size or colour null means "sin talla" / "sin color".
 */

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../index";
import { stockMovements } from "../schema";

export type StockOnHandRow = {
  clothPieceVariantId: string;
  sizeId: string | null;
  colorId: string | null;
  onHand: number;
};

export async function getStockOnHand(
  db: Database,
  filter: { clothPieceVariantId?: string; includeZero?: boolean } = {},
): Promise<StockOnHandRow[]> {
  const onHand = sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int`;
  const rows = await db
    .select({
      clothPieceVariantId: stockMovements.clothPieceVariantId,
      sizeId: stockMovements.sizeId,
      colorId: stockMovements.colorId,
      onHand,
    })
    .from(stockMovements)
    .where(
      filter.clothPieceVariantId
        ? eq(stockMovements.clothPieceVariantId, filter.clothPieceVariantId)
        : undefined,
    )
    .groupBy(stockMovements.clothPieceVariantId, stockMovements.sizeId, stockMovements.colorId)
    .having(filter.includeZero ? undefined : sql`SUM(${stockMovements.quantity}) <> 0`);
  return rows.map((r) => ({ ...r, onHand: Number(r.onHand) }));
}

/** Units on hand of one exact variant + size + colour (null matches null). */
export async function getStockOnHandFor(
  db: Database,
  item: { clothPieceVariantId: string; sizeId: string | null; colorId: string | null },
): Promise<number> {
  const conditions: SQL[] = [
    eq(stockMovements.clothPieceVariantId, item.clothPieceVariantId),
    item.sizeId ? eq(stockMovements.sizeId, item.sizeId) : isNull(stockMovements.sizeId),
    item.colorId ? eq(stockMovements.colorId, item.colorId) : isNull(stockMovements.colorId),
  ];
  const [row] = await db
    .select({ onHand: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int` })
    .from(stockMovements)
    .where(and(...conditions));
  return Number(row?.onHand ?? 0);
}
