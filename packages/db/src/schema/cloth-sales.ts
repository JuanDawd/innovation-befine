import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businessDays } from "./business-days";
import { clothPieces } from "./cloth-pieces";
import { clothPieceVariants } from "./cloth-pieces";
import { clients } from "./clients";
import { paymentMethodEnum } from "./enums";
import { employees } from "./employees";
import { tickets } from "./tickets";
import { garmentColors, garmentSizes } from "./garment-attributes";

/**
 * cloth_sales — direct retail sales of cloth pieces to walk-in customers.
 *
 * Revenue goes to the store. No employee commission.
 * T113: sells from stock — each sale has a size and colour and writes a
 *   negative stock_movements row (T129). Taken after hours, business_day_id
 *   stays null until the next day opens (spec §3.5.20); received_at is the real time.
 * Optionally linked to an existing ticket (when the customer also has services).
 * Paid on the spot (H-50): payment_method is recorded on the sale itself.
 */
export const clothSales = pgTable(
  "cloth_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null only while an after-hours sale waits for the next business day */
    businessDayId: uuid("business_day_id").references(() => businessDays.id, {
      onDelete: "restrict",
    }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    afterHours: boolean("after_hours").notNull().default(false),
    /** Optional — links to an existing service ticket for the same customer */
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "restrict" }),
    clothPieceId: uuid("cloth_piece_id")
      .notNull()
      .references(() => clothPieces.id, { onDelete: "restrict" }),
    clothPieceVariantId: uuid("cloth_piece_variant_id")
      .notNull()
      .references(() => clothPieceVariants.id, { onDelete: "restrict" }),
    sizeId: uuid("size_id").references(() => garmentSizes.id, { onDelete: "restrict" }),
    colorId: uuid("color_id").references(() => garmentColors.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    /** Snapshot of cloth_piece_variants.selling_price at sale time */
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
    /** Cashier override — null means unitPrice was used as-is */
    priceOverride: bigint("price_override", { mode: "number" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),
    guestName: text("guest_name"),
    soldBy: uuid("sold_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    notes: text("notes"),
    /** H-50 — null only on sales recorded before payment method was captured */
    paymentMethod: paymentMethodEnum("payment_method"),
    /** H-50 — client-generated; a retried submit returns the original sale */
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("chk_cloth_sales_quantity", sql`${t.quantity} >= 1`),
    check("chk_cloth_sales_unit_price", sql`${t.unitPrice} >= 0`),
    check(
      "chk_cloth_sales_price_override",
      sql`${t.priceOverride} IS NULL OR ${t.priceOverride} >= 0`,
    ),
    check(
      "chk_cloth_sales_client_or_guest",
      sql`${t.clientId} IS NOT NULL OR (${t.guestName} IS NOT NULL AND ${t.guestName} <> '') OR (${t.clientId} IS NULL AND ${t.guestName} IS NULL)`,
    ),
    check("chk_cloth_sales_business_day", sql`${t.businessDayId} IS NOT NULL OR ${t.afterHours}`),
    index("idx_cloth_sales_business_day").on(t.businessDayId),
    index("idx_cloth_sales_ticket").on(t.ticketId),
  ],
);
