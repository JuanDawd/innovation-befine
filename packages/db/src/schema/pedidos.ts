/**
 * Pedidos — T111 (spec: docs/Business/pedidos-spec.md §3.1, §4)
 *
 * One order model for garments, for a saved client or for inventory.
 *
 * pedidos: header. `number` is the human sequential number (#0412).
 *   destination 'client' requires client_id; 'inventory' forbids it.
 *   Status, balance and saldo a favor are derived, never stored.
 * pedido_lines: 'garment' lines (variant, colour, style, size grid, unit_price
 *   snapshot) or 'adjustment' lines (signed amount with a required reason).
 *   unit_price is copied from the variant's selling_price at creation;
 *   price_reason is required (in the action layer) when it differs.
 * pedido_line_cells: one size of a garment line with its unit count — the unit
 *   of assignment, review, delivery and stock.
 *
 * Total = Σ garment cells × unit_price + Σ adjustment amounts
 * (computed by computePedidoTotal in queries/pedido-totals.ts).
 */

import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clients } from "./clients";
import { employees } from "./employees";
import { clothPieceVariants } from "./cloth-pieces";
import { garmentColors, garmentSizes } from "./garment-attributes";

export const pedidoDestinationEnum = pgEnum("pedido_destination_enum", ["client", "inventory"]);

export const pedidoLineKindEnum = pgEnum("pedido_line_kind_enum", ["garment", "adjustment"]);

export const pedidos = pgTable(
  "pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human sequential number, shown as #0412 */
    number: integer("number").notNull().generatedAlwaysAsIdentity(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),
    destination: pedidoDestinationEnum("destination").notNull(),
    estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),
    notes: text("notes"),
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_pedidos_number").on(t.number),
    index("idx_pedidos_client").on(t.clientId),
    index("idx_pedidos_estimated_delivery").on(t.estimatedDeliveryAt),
    check(
      "chk_pedidos_destination_client",
      sql`(${t.destination} = 'client' AND ${t.clientId} IS NOT NULL)
        OR (${t.destination} = 'inventory' AND ${t.clientId} IS NULL)`,
    ),
    check(
      "chk_pedidos_cancellation",
      sql`(${t.cancelledAt} IS NULL) = (${t.cancellationReason} IS NULL)`,
    ),
  ],
);

export const pedidoLines = pgTable(
  "pedido_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    kind: pedidoLineKindEnum("kind").notNull(),
    /** Display order within the pedido */
    position: integer("position").notNull().default(0),
    clothPieceVariantId: uuid("cloth_piece_variant_id").references(() => clothPieceVariants.id, {
      onDelete: "restrict",
    }),
    colorId: uuid("color_id").references(() => garmentColors.id, { onDelete: "restrict" }),
    /** Free-text colour when it is not on the admin list ("otro") */
    colorOther: text("color_other"),
    style: text("style"),
    instructions: text("instructions"),
    /** Garment lines: price per unit in whole COP, snapshot of the variant's selling_price */
    unitPrice: bigint("unit_price", { mode: "number" }),
    /** Why unit_price differs from the selling price, or why the adjustment exists */
    priceReason: text("price_reason"),
    /** Adjustment lines: signed whole COP (negative = discount) */
    amount: bigint("amount", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_pedido_lines_pedido").on(t.pedidoId),
    check(
      "chk_pedido_lines_kind",
      sql`(${t.kind} = 'garment'
          AND ${t.clothPieceVariantId} IS NOT NULL
          AND ${t.unitPrice} IS NOT NULL
          AND ${t.amount} IS NULL)
        OR (${t.kind} = 'adjustment'
          AND ${t.clothPieceVariantId} IS NULL
          AND ${t.unitPrice} IS NULL
          AND ${t.amount} IS NOT NULL
          AND ${t.priceReason} IS NOT NULL
          AND ${t.colorId} IS NULL
          AND ${t.colorOther} IS NULL)`,
    ),
    check("chk_pedido_lines_unit_price", sql`${t.unitPrice} IS NULL OR ${t.unitPrice} >= 0`),
    check("chk_pedido_lines_amount", sql`${t.amount} IS NULL OR ${t.amount} <> 0`),
    check("chk_pedido_lines_color", sql`${t.colorId} IS NULL OR ${t.colorOther} IS NULL`),
  ],
);

export const pedidoLineCells = pgTable(
  "pedido_line_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => pedidoLines.id, { onDelete: "restrict" }),
    sizeId: uuid("size_id").references(() => garmentSizes.id, { onDelete: "restrict" }),
    /** Free-text size when it is not on the admin list ("otro") */
    sizeOther: text("size_other"),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_pedido_line_cells_line").on(t.lineId),
    uniqueIndex("idx_pedido_line_cells_line_size")
      .on(t.lineId, t.sizeId)
      .where(sql`${t.sizeId} IS NOT NULL`),
    uniqueIndex("idx_pedido_line_cells_line_size_other")
      .on(t.lineId, sql`lower(${t.sizeOther})`)
      .where(sql`${t.sizeOther} IS NOT NULL`),
    check("chk_pedido_line_cells_quantity", sql`${t.quantity} >= 1`),
    check("chk_pedido_line_cells_size", sql`(${t.sizeId} IS NULL) <> (${t.sizeOther} IS NULL)`),
  ],
);
