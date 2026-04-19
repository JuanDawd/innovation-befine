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
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { employees } from "./employees";
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
