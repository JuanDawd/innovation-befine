/**
 * Large cloth orders — T057
 *
 * large_orders: client commissions for multi-piece custom clothing orders
 *   tracked separately from the ticket/batch system.
 * large_order_payments: running payment ledger; balance_due is computed
 *   in queries (total_price - SUM(payments)) — never stored as a column.
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
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clients } from "./clients";
import { employees } from "./employees";
import { clothPieces, clothPieceVariants } from "./cloth-pieces";
import { paymentMethodEnum } from "./enums";

export const largeOrderStatusEnum = pgEnum("large_order_status_enum", [
  "pending",
  "in_production",
  "ready",
  "delivered",
  "paid_in_full",
  "cancelled",
]);

export const largeOrders = pgTable(
  "large_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    totalPrice: bigint("total_price", { mode: "number" }).notNull(),
    status: largeOrderStatusEnum("status").notNull().default("pending"),
    estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),
    notes: text("notes"),
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_large_orders_client").on(table.clientId),
    index("idx_large_orders_status").on(table.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    largeOrderId: uuid("large_order_id")
      .notNull()
      .references(() => largeOrders.id, { onDelete: "restrict" }),
    clothPieceId: uuid("cloth_piece_id")
      .notNull()
      .references(() => clothPieces.id, { onDelete: "restrict" }),
    clothPieceVariantId: uuid("cloth_piece_variant_id")
      .notNull()
      .references(() => clothPieceVariants.id, { onDelete: "restrict" }),
    pieceName: varchar("piece_name", { length: 120 }).notNull(),
    quantity: integer("quantity").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("chk_order_items_quantity", sql`${t.quantity} >= 1`),
    index("idx_order_items_large_order").on(t.largeOrderId),
  ],
);

export const largeOrderPayments = pgTable(
  "large_order_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => largeOrders.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
  },
  (table) => [index("idx_large_order_payments_order").on(table.orderId)],
);
