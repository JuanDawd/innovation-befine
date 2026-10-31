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
  detailsKey: string;
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
      detailsKey: stockMovements.detailsKey,
      onHand,
    })
    .from(stockMovements)
    .where(
      filter.clothPieceVariantId
        ? eq(stockMovements.clothPieceVariantId, filter.clothPieceVariantId)
        : undefined,
    )
    .groupBy(
      stockMovements.clothPieceVariantId,
      stockMovements.sizeId,
      stockMovements.colorId,
      stockMovements.detailsKey,
    )
    .having(filter.includeZero ? undefined : sql`SUM(${stockMovements.quantity}) <> 0`);
  return rows.map((r) => ({ ...r, onHand: Number(r.onHand) }));
}

/** Units on hand of one exact variant + size + colour (null matches null). */
export async function getStockOnHandFor(
  db: Database,
  item: {
    clothPieceVariantId: string;
    sizeId: string | null;
    colorId: string | null;
    detailsKey?: string;
  },
): Promise<number> {
  const conditions: SQL[] = [
    eq(stockMovements.clothPieceVariantId, item.clothPieceVariantId),
    item.sizeId ? eq(stockMovements.sizeId, item.sizeId) : isNull(stockMovements.sizeId),
    item.colorId ? eq(stockMovements.colorId, item.colorId) : isNull(stockMovements.colorId),
    eq(stockMovements.detailsKey, item.detailsKey ?? ""),
  ];
  const [row] = await db
    .select({ onHand: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int` })
    .from(stockMovements)
    .where(and(...conditions));
  return Number(row?.onHand ?? 0);
}

// ─── Inventario (T128) ───────────────────────────────────────────────────────

export type StockItem = {
  clothPieceVariantId: string;
  sizeId: string | null;
  colorId: string | null;
  detailsKey: string;
  detailsLabel: string;
  garment: string;
  sizeLabel: string | null;
  sizeOrder: number | null;
  colorLabel: string | null;
  colorHex: string | null;
  sellingPrice: number | null;
  onHand: number;
  lastMovementAt: Date;
};

/**
 * Every variant + size + colour that ever had a movement, with what is on
 * hand now. Sold-out items stay listed (0) so their history is reachable.
 */
export async function listStockItems(db: Database): Promise<StockItem[]> {
  const rows = await db.execute(sql`
    SELECT m.cloth_piece_variant_id, m.size_id, m.color_id, m.details_key,
      max(m.details_label) AS details_label,
      cp.name || ' — ' || v.name AS garment, gs.label AS size_label, gs.sort_order AS size_order,
      gc.label AS color_label, gc.hex AS color_hex, v.selling_price,
      sum(m.quantity)::int AS on_hand, max(m.created_at) AS last_at
    FROM stock_movements m
    JOIN cloth_piece_variants v ON v.id = m.cloth_piece_variant_id
    JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
    LEFT JOIN garment_sizes gs ON gs.id = m.size_id
    LEFT JOIN garment_colors gc ON gc.id = m.color_id
    GROUP BY m.cloth_piece_variant_id, m.size_id, m.color_id, m.details_key, cp.name, v.name, gs.label,
      gs.sort_order, gc.label, gc.hex, v.selling_price
    ORDER BY garment, gs.sort_order NULLS LAST, gc.label NULLS FIRST, m.details_key
  `);
  return (
    rows.rows as {
      cloth_piece_variant_id: string;
      size_id: string | null;
      color_id: string | null;
      details_key: string;
      details_label: string;
      garment: string;
      size_label: string | null;
      size_order: number | null;
      color_label: string | null;
      color_hex: string | null;
      selling_price: string | null;
      on_hand: number;
      last_at: string;
    }[]
  ).map((r) => ({
    clothPieceVariantId: r.cloth_piece_variant_id,
    sizeId: r.size_id,
    colorId: r.color_id,
    detailsKey: r.details_key,
    detailsLabel: r.details_label,
    garment: r.garment,
    sizeLabel: r.size_label,
    sizeOrder: r.size_order,
    colorLabel: r.color_label,
    colorHex: r.color_hex,
    sellingPrice: r.selling_price === null ? null : Number(r.selling_price),
    onHand: Number(r.on_hand),
    lastMovementAt: new Date(r.last_at),
  }));
}

export type StockMovementRow = {
  id: string;
  quantity: number;
  kind: "production" | "adjustment" | "sale" | "scrap" | "restructure";
  reason: string | null;
  refType: string | null;
  refId: string | null;
  /** Human link to the source, e.g. "Pedido #0012" */
  source: string | null;
  createdByName: string | null;
  createdAt: Date;
};

/** Movement history of one variant + size + colour, newest first. */
export async function listStockMovements(
  db: Database,
  item: {
    clothPieceVariantId: string;
    sizeId: string | null;
    colorId: string | null;
    detailsKey?: string;
  },
  limit = 100,
): Promise<StockMovementRow[]> {
  const rows = await db.execute(sql`
    SELECT m.id, m.quantity, m.kind, m.reason, m.ref_type, m.ref_id, m.created_at, u.name AS created_by_name,
      CASE m.ref_type
        WHEN 'unit_review' THEN (
          SELECT 'Pedido #' || lpad(p.number::text, 4, '0')
          FROM unit_reviews r JOIN assignments a ON a.id = r.assignment_id
          JOIN pedido_line_cells c ON c.id = a.cell_id JOIN pedido_lines l ON l.id = c.line_id
          JOIN pedidos p ON p.id = l.pedido_id WHERE r.id = m.ref_id)
        WHEN 'restructure' THEN (
          SELECT 'Pedido #' || lpad(p.number::text, 4, '0')
          FROM restructures x JOIN pedidos p ON p.id = x.pedido_id WHERE x.id = m.ref_id)
        ELSE NULL END AS source
    FROM stock_movements m
    LEFT JOIN employees e ON e.id = m.created_by
    LEFT JOIN users u ON u.id = e.user_id
    WHERE m.cloth_piece_variant_id = ${item.clothPieceVariantId}
      AND m.size_id IS NOT DISTINCT FROM ${item.sizeId}::uuid
      AND m.color_id IS NOT DISTINCT FROM ${item.colorId}::uuid
      AND m.details_key = ${item.detailsKey ?? ""}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${limit}
  `);
  return (
    rows.rows as {
      id: string;
      quantity: number;
      kind: StockMovementRow["kind"];
      reason: string | null;
      ref_type: string | null;
      ref_id: string | null;
      created_at: string;
      created_by_name: string | null;
      source: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    quantity: Number(r.quantity),
    kind: r.kind,
    reason: r.reason,
    refType: r.ref_type,
    refId: r.ref_id,
    source: r.source,
    createdByName: r.created_by_name,
    createdAt: new Date(r.created_at),
  }));
}

// ─── Details that split stock (T139) ─────────────────────────────────────────

/**
 * The custom details of a cell's line that make its units a different stock item.
 * Typed values are left out: they are never counted as their own item.
 */
export async function stockDetailsOfCell(
  db: Pick<Database, "execute">,
  cellId: string,
): Promise<{ detailsKey: string; detailsLabel: string }> {
  const res = await db.execute(sql`
    SELECT coalesce(string_agg(d.id || ':' || v.id, '|' ORDER BY d.id), '') AS key,
      coalesce(string_agg(d.name || ': ' || v.label, ' · ' ORDER BY d.sort_order, d.name), '') AS label
    FROM pedido_line_cells c
    JOIN pedido_line_details pld ON pld.line_id = c.line_id
    JOIN details d ON d.id = pld.detail_id AND d.splits_stock
    JOIN detail_values v ON v.id = pld.value_id
    WHERE c.id = ${cellId}
  `);
  const row = res.rows[0] as { key: string; label: string } | undefined;
  return { detailsKey: row?.key ?? "", detailsLabel: row?.label ?? "" };
}
