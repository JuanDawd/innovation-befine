/**
 * Analítica additions — T133 (spec §3.11)
 *
 * Pedidos, producción and inventario figures for a period. Pedido money comes
 * from listPedidoOverviews (the same numbers the pedido screens show); stock
 * from the movements ledger; production from unit reviews of the period's
 * business days. Point-in-time figures (cuentas por cobrar, saldo a favor,
 * overdue, stock on hand, slow movers) are "now"; the rest are per period.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../index";
import { listPedidoOverviews } from "./pedidos";
import { listStockItems } from "./stock";

export type Window = { start: Date; end: Date };
const days = (ids: string[]) =>
  sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export type Receivable = {
  id: string;
  number: number;
  clientName: string | null;
  balance: number;
  createdAt: Date;
  ageDays: number;
};

export type PedidoPeriodFigures = {
  created: number;
  units: number;
  /** Client pedidos fully delivered in the period */
  completed: number;
  /** Of those with a promised date, delivered on or before it */
  onTime: number;
  withPromise: number;
  /** Average days from creation to the last delivery */
  avgLeadDays: number | null;
};

export type PedidoNowFigures = {
  receivables: Receivable[];
  receivablesTotal: number;
  saldoAFavorTotal: number;
  saldoAFavorCount: number;
  overdue: {
    id: string;
    number: number;
    clientName: string | null;
    estimatedDeliveryDate: string;
  }[];
};

const DAY_MS = 86_400_000;

export async function pedidoFiguresNow(
  db: Database,
  today: string,
  now = new Date(),
): Promise<PedidoNowFigures> {
  const all = await listPedidoOverviews(db, { today, limit: 100_000 });
  const receivables = all
    .filter((p) => p.destination === "client" && p.status !== "cancelled" && p.balance > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((p) => ({
      id: p.id,
      number: p.number,
      clientName: p.clientName,
      balance: p.balance,
      createdAt: p.createdAt,
      ageDays: Math.floor((now.getTime() - p.createdAt.getTime()) / DAY_MS),
    }));
  const owed = all.filter((p) => p.saldoAFavor > 0);
  return {
    receivables,
    receivablesTotal: receivables.reduce((n, r) => n + r.balance, 0),
    saldoAFavorTotal: owed.reduce((n, p) => n + p.saldoAFavor, 0),
    saldoAFavorCount: owed.length,
    overdue: all
      .filter((p) => p.deliveryFlag === "overdue")
      .map((p) => ({
        id: p.id,
        number: p.number,
        clientName: p.clientName,
        estimatedDeliveryDate: p.estimatedDeliveryDate!,
      })),
  };
}

export async function pedidoFiguresForPeriod(
  db: Database,
  w: Window,
): Promise<PedidoPeriodFigures> {
  const res = await db.execute(sql`
    WITH ordered AS (
      SELECT l.pedido_id, sum(c.quantity) AS units
      FROM pedido_lines l JOIN pedido_line_cells c ON c.line_id = l.id GROUP BY l.pedido_id
    ),
    delivered AS (
      SELECT l.pedido_id, sum(dc.quantity) AS units, max(d.delivered_at) AS last_at
      FROM delivery_cells dc
      JOIN deliveries d ON d.id = dc.delivery_id
      JOIN pedido_line_cells c ON c.id = dc.cell_id
      JOIN pedido_lines l ON l.id = c.line_id
      GROUP BY l.pedido_id
    ),
    created AS (
      SELECT count(*)::int AS n, coalesce(sum(o.units), 0)::int AS units
      FROM pedidos p LEFT JOIN ordered o ON o.pedido_id = p.id
      WHERE p.cancelled_at IS NULL AND p.created_at BETWEEN ${w.start.toISOString()} AND ${w.end.toISOString()}
    ),
    done AS (
      SELECT p.created_at, p.estimated_delivery_at, d.last_at
      FROM pedidos p JOIN ordered o ON o.pedido_id = p.id JOIN delivered d ON d.pedido_id = p.id
      WHERE p.destination = 'client' AND p.cancelled_at IS NULL AND d.units >= o.units
        AND d.last_at BETWEEN ${w.start.toISOString()} AND ${w.end.toISOString()}
    )
    SELECT (SELECT n FROM created) AS created, (SELECT units FROM created) AS units,
      (SELECT count(*)::int FROM done) AS completed,
      (SELECT count(*)::int FROM done WHERE estimated_delivery_at IS NOT NULL) AS with_promise,
      (SELECT count(*)::int FROM done WHERE estimated_delivery_at IS NOT NULL
        AND (last_at AT TIME ZONE 'America/Bogota')::date <= (estimated_delivery_at AT TIME ZONE 'America/Bogota')::date) AS on_time,
      (SELECT avg(extract(epoch FROM last_at - created_at)) / 86400 FROM done) AS avg_lead_days
  `);
  const r = res.rows[0] as Record<string, string | number | null>;
  return {
    created: Number(r.created),
    units: Number(r.units),
    completed: Number(r.completed),
    onTime: Number(r.on_time),
    withPromise: Number(r.with_promise),
    avgLeadDays: r.avg_lead_days === null ? null : Math.round(Number(r.avg_lead_days) * 10) / 10,
  };
}

// ─── Producción ──────────────────────────────────────────────────────────────

export type ClothierProduction = {
  employeeId: string;
  name: string;
  approved: number;
  returned: number;
  scrapped: number;
  /** returned ÷ reviewed */
  returnRate: number;
};

export type GarmentProduction = {
  clothPieceVariantId: string;
  garment: string;
  approved: number;
  returned: number;
  returnRate: number;
  /** Approved (and paid scrapped) units × assignment rate */
  labourCost: number;
  /** Approved units × pedido line price */
  price: number;
  margin: number;
};

export type ProductionFigures = {
  byClothier: ClothierProduction[];
  byGarment: GarmentProduction[];
  /** Average hours from assignment to the review that approved units */
  avgAssignToApprovalHours: number | null;
};

const rate = (returned: number, reviewed: number) =>
  reviewed === 0 ? 0 : Math.round((returned / reviewed) * 1000) / 10;

export async function productionFigures(
  db: Database,
  dayIds: string[],
): Promise<ProductionFigures> {
  if (dayIds.length === 0) return { byClothier: [], byGarment: [], avgAssignToApprovalHours: null };
  const reviews = sql`
    SELECT r.*, a.employee_id, a.piece_rate, a.created_at AS assigned_at, l.cloth_piece_variant_id, l.unit_price
    FROM unit_reviews r
    JOIN assignments a ON a.id = r.assignment_id
    JOIN pedido_line_cells c ON c.id = a.cell_id
    JOIN pedido_lines l ON l.id = c.line_id
    WHERE r.business_day_id = ANY(${days(dayIds)})`;
  const [byClothier, byGarment, timing] = await Promise.all([
    db.execute(sql`
      SELECT x.employee_id, u.name, sum(x.approved)::int AS approved, sum(x.returned)::int AS returned,
        sum(x.scrapped)::int AS scrapped
      FROM (${reviews}) x JOIN employees e ON e.id = x.employee_id JOIN users u ON u.id = e.user_id
      GROUP BY x.employee_id, u.name ORDER BY approved DESC, u.name`),
    db.execute(sql`
      SELECT x.cloth_piece_variant_id, cp.name || ' — ' || v.name AS garment,
        sum(x.approved)::int AS approved, sum(x.returned)::int AS returned,
        sum(x.approved + x.returned + x.scrapped)::int AS reviewed,
        sum((x.approved + CASE WHEN x.scrap_paid THEN x.scrapped ELSE 0 END) * x.piece_rate)::bigint AS labour,
        sum(x.approved * x.unit_price)::bigint AS price
      FROM (${reviews}) x
      JOIN cloth_piece_variants v ON v.id = x.cloth_piece_variant_id
      JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
      GROUP BY x.cloth_piece_variant_id, cp.name, v.name ORDER BY approved DESC, garment`),
    db.execute(sql`
      SELECT avg(extract(epoch FROM x.created_at - x.assigned_at)) / 3600 AS hours
      FROM (${reviews}) x WHERE x.approved > 0`),
  ]);
  const hours = (timing.rows[0] as { hours: string | null }).hours;
  return {
    byClothier: (
      byClothier.rows as {
        employee_id: string;
        name: string;
        approved: number;
        returned: number;
        scrapped: number;
      }[]
    ).map((r) => ({
      employeeId: r.employee_id,
      name: r.name,
      approved: Number(r.approved),
      returned: Number(r.returned),
      scrapped: Number(r.scrapped),
      returnRate: rate(
        Number(r.returned),
        Number(r.approved) + Number(r.returned) + Number(r.scrapped),
      ),
    })),
    byGarment: (
      byGarment.rows as {
        cloth_piece_variant_id: string;
        garment: string;
        approved: number;
        returned: number;
        reviewed: number;
        labour: string;
        price: string;
      }[]
    ).map((r) => ({
      clothPieceVariantId: r.cloth_piece_variant_id,
      garment: r.garment,
      approved: Number(r.approved),
      returned: Number(r.returned),
      returnRate: rate(Number(r.returned), Number(r.reviewed)),
      labourCost: Number(r.labour),
      price: Number(r.price),
      margin: Number(r.price) - Number(r.labour),
    })),
    avgAssignToApprovalHours: hours === null ? null : Math.round(Number(hours) * 10) / 10,
  };
}

// ─── Inventario ──────────────────────────────────────────────────────────────

export type InventoryNowFigures = {
  unitsOnHand: number;
  /** Units on hand × variant selling price (items without a price count 0) */
  valueAtPrice: number;
  /** On hand and untouched for 60+ days */
  slowMovers: {
    garment: string;
    sizeLabel: string | null;
    colorLabel: string | null;
    onHand: number;
    lastMovementAt: Date;
  }[];
};

export type InventoryPeriodFigures = {
  unitsSold: number;
  writeOffs: { garment: string; quantity: number; reason: string | null; createdAt: Date }[];
  writeOffUnits: number;
};

export async function inventoryFiguresNow(
  db: Database,
  now = new Date(),
): Promise<InventoryNowFigures> {
  const items = await listStockItems(db);
  const inStock = items.filter((i) => i.onHand > 0);
  const cutoff = now.getTime() - 60 * DAY_MS;
  return {
    unitsOnHand: inStock.reduce((n, i) => n + i.onHand, 0),
    valueAtPrice: inStock.reduce((n, i) => n + i.onHand * (i.sellingPrice ?? 0), 0),
    slowMovers: inStock
      .filter((i) => i.lastMovementAt.getTime() < cutoff)
      .sort((a, b) => a.lastMovementAt.getTime() - b.lastMovementAt.getTime())
      .map((i) => ({
        garment: i.garment,
        sizeLabel: i.sizeLabel,
        colorLabel: i.colorLabel,
        onHand: i.onHand,
        lastMovementAt: i.lastMovementAt,
      })),
  };
}

export async function inventoryFiguresForPeriod(
  db: Database,
  w: Window,
  dayIds: string[],
): Promise<InventoryPeriodFigures> {
  const [sold, writeOffs] = await Promise.all([
    dayIds.length
      ? db.execute(
          sql`SELECT coalesce(sum(quantity), 0)::int AS n FROM cloth_sales WHERE business_day_id = ANY(${days(dayIds)})`,
        )
      : Promise.resolve({ rows: [{ n: 0 }] }),
    db.execute(sql`
      SELECT cp.name || ' — ' || v.name AS garment, -m.quantity AS quantity, m.reason, m.created_at
      FROM stock_movements m
      JOIN cloth_piece_variants v ON v.id = m.cloth_piece_variant_id
      JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
      WHERE m.quantity < 0 AND m.kind IN ('adjustment', 'scrap')
        AND m.created_at BETWEEN ${w.start.toISOString()} AND ${w.end.toISOString()}
      ORDER BY m.created_at DESC`),
  ]);
  const rows = (
    writeOffs.rows as {
      garment: string;
      quantity: number;
      reason: string | null;
      created_at: string;
    }[]
  ).map((r) => ({
    garment: r.garment,
    quantity: Number(r.quantity),
    reason: r.reason,
    createdAt: new Date(r.created_at),
  }));
  return {
    unitsSold: Number((sold.rows[0] as { n: number }).n),
    writeOffs: rows,
    writeOffUnits: rows.reduce((n, r) => n + r.quantity, 0),
  };
}
