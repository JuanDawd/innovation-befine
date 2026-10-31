/**
 * Pedido money and stock — T113 (spec: docs/Business/pedidos-spec.md §3.4–3.6, §4)
 *
 * pedido_payments: every peso received for (or refunded on) a pedido. Signed:
 *   refunds are negative. business_day_id stays null for an after-hours payment
 *   until the next business day opens and claims it (spec §3.5.20); received_at
 *   keeps the real time. Never deleted; only that one attach is allowed (trigger).
 * stock_movements: signed ledger per variant + size + colour. Stock on hand is
 *   the sum of movements (queries/stock.ts) — never a column. Immutable.
 * restructures: admin-approved changes after production starts (spec §3.4.17),
 *   one row per event with the full before/after in `summary`.
 *
 * Balance and saldo a favor are derived (queries/pedido-balance.ts).
 */

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businessDays } from "./business-days";
import { clothPieceVariants } from "./cloth-pieces";
import { employees } from "./employees";
import { paymentMethodEnum } from "./enums";
import { garmentColors, garmentSizes } from "./garment-attributes";
import { pedidos } from "./pedidos";

export const stockMovementKindEnum = pgEnum("stock_movement_kind_enum", [
  "production",
  "adjustment",
  "sale",
  "scrap",
  "restructure",
]);

export const pedidoPayments = pgTable(
  "pedido_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    /** Whole COP; negative for a refund */
    amount: bigint("amount", { mode: "number" }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    /** Null only while an after-hours payment waits for the next business day */
    businessDayId: uuid("business_day_id").references(() => businessDays.id, {
      onDelete: "restrict",
    }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    afterHours: boolean("after_hours").notNull().default(false),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    note: text("note"),
    /** Client-generated; a retried submit returns the original payment */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_pedido_payments_pedido").on(t.pedidoId),
    index("idx_pedido_payments_business_day").on(t.businessDayId),
    index("idx_pedido_payments_unattached")
      .on(t.receivedAt)
      .where(sql`${t.businessDayId} IS NULL`),
    check("chk_pedido_payments_amount", sql`${t.amount} <> 0`),
    check(
      "chk_pedido_payments_business_day",
      sql`${t.businessDayId} IS NOT NULL OR ${t.afterHours}`,
    ),
    check("chk_pedido_payments_refund_note", sql`${t.amount} > 0 OR ${t.note} IS NOT NULL`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clothPieceVariantId: uuid("cloth_piece_variant_id")
      .notNull()
      .references(() => clothPieceVariants.id, { onDelete: "restrict" }),
    /** Null = no size (garment sold without one) */
    sizeId: uuid("size_id").references(() => garmentSizes.id, { onDelete: "restrict" }),
    /** Null = no colour */
    colorId: uuid("color_id").references(() => garmentColors.id, { onDelete: "restrict" }),
    /**
     * T139 — the line's custom details that split stock, in a stable order: part of
     * what this item is. Empty for items with none, including everything before T139.
     */
    detailsKey: text("details_key").notNull().default(""),
    /** Those details as people read them, "Tela: Seda" */
    detailsLabel: text("details_label").notNull().default(""),
    /** Signed units: + into stock, − out of stock */
    quantity: integer("quantity").notNull(),
    kind: stockMovementKindEnum("kind").notNull(),
    /** What caused it, e.g. 'unit_review', 'cloth_sale', 'restructure' */
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    reason: text("reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_stock_movements_item").on(t.clothPieceVariantId, t.sizeId, t.colorId, t.detailsKey),
    index("idx_stock_movements_ref").on(t.refType, t.refId),
    check("chk_stock_movements_quantity", sql`${t.quantity} <> 0`),
    check(
      "chk_stock_movements_reason",
      sql`${t.kind} NOT IN ('adjustment', 'scrap', 'restructure') OR ${t.reason} IS NOT NULL`,
    ),
    check("chk_stock_movements_ref", sql`(${t.refType} IS NULL) = (${t.refId} IS NULL)`),
  ],
);

export const restructures = pgTable(
  "restructures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => employees.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** T120 — an admin may turn the draft down; it then stays as history */
    rejectedBy: uuid("rejected_by").references(() => employees.id, { onDelete: "restrict" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    reason: text("reason").notNull(),
    /** Before/after of every line, cell, assignment and money move in the event */
    summary: jsonb("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_restructures_pedido").on(t.pedidoId),
    // T120 — one draft at a time per pedido
    uniqueIndex("uq_restructures_pedido_pending")
      .on(t.pedidoId)
      .where(sql`${t.approvedAt} IS NULL AND ${t.rejectedAt} IS NULL`),
    check("chk_restructures_rejection", sql`(${t.rejectedBy} IS NULL) = (${t.rejectedAt} IS NULL)`),
    check("chk_restructures_approval", sql`(${t.approvedBy} IS NULL) = (${t.approvedAt} IS NULL)`),
  ],
);
