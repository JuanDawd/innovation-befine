import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businessDays } from "./business-days";
import { clothPieces } from "./cloth-pieces";
import { clothPieceVariants } from "./cloth-pieces";
import { clients } from "./clients";
import { employees } from "./employees";
import { tickets } from "./tickets";

/**
 * cloth_sales — direct retail sales of cloth pieces to walk-in customers.
 *
 * Revenue goes to the store. No employee commission.
 * No stock tracking in MVP — stock management is Post-MVP.
 * Optionally linked to an existing ticket (when the customer also has services).
 */
export const clothSales = pgTable(
  "cloth_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessDayId: uuid("business_day_id")
      .notNull()
      .references(() => businessDays.id, { onDelete: "restrict" }),
    /** Optional — links to an existing service ticket for the same customer */
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "restrict" }),
    clothPieceId: uuid("cloth_piece_id")
      .notNull()
      .references(() => clothPieces.id, { onDelete: "restrict" }),
    clothPieceVariantId: uuid("cloth_piece_variant_id")
      .notNull()
      .references(() => clothPieceVariants.id, { onDelete: "restrict" }),
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
    index("idx_cloth_sales_business_day").on(t.businessDayId),
    index("idx_cloth_sales_ticket").on(t.ticketId),
  ],
);
