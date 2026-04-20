import {
  pgTable,
  uuid,
  integer,
  bigint,
  numeric,
  text,
  timestamp,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tickets } from "./tickets";
import { serviceVariants } from "./services";

/**
 * ticket_items — T034
 *
 * One row per service logged on a ticket.
 * unit_price and commission_pct are snapshots at log time — they never
 * change even when the catalog is updated later.
 * override_price (cashier-only) and override_reason are set at checkout (T040).
 */
export const ticketItems = pgTable(
  "ticket_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "restrict" }),
    serviceVariantId: uuid("service_variant_id")
      .notNull()
      .references(() => serviceVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    /** Snapshot of service_variants.customer_price at log time */
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
    /** Snapshot of service_variants.commission_pct at log time */
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull(),
    /** Set only by cashier at checkout (T040) */
    overridePrice: bigint("override_price", { mode: "number" }),
    /** Required when override_price is set */
    overrideReason: text("override_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("chk_ticket_items_quantity", sql`${t.quantity} >= 1`),
    check("chk_ticket_items_unit_price", sql`${t.unitPrice} >= 0`),
    check(
      "chk_ticket_items_override_price",
      sql`${t.overridePrice} IS NULL OR ${t.overridePrice} >= 0`,
    ),
    check(
      "chk_ticket_items_override_reason",
      sql`${t.overridePrice} IS NULL OR (${t.overrideReason} IS NOT NULL AND ${t.overrideReason} <> '')`,
    ),
    // T075: analytics — covers JOIN from tickets to ticket_items in revenue queries
    index("idx_ticket_items_ticket_id").on(t.ticketId),
  ],
);
