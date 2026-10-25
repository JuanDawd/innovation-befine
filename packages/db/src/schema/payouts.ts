/**
 * Payouts — T066 + T07R-R1 + T07R-R2
 *
 * payouts: one record per employee payment for a set of business days.
 * payout_period_days: junction table replacing period_business_day_ids array.
 *   UNIQUE(employee_id, business_day_id) physically prevents double-pay under concurrency.
 * payout_ticket_items: links a stylist payout to the ticket items it covers.
 * payout_craftable_pieces: links a clothier payout to the product pieces it covers.
 * payout_unit_reviews: links a clothier payout to the pedido unit reviews it paid (T126).
 *
 * idempotency_key: client-generated UUID; UNIQUE prevents duplicate inserts on retry.
 * original_computed_amount: what the system computed before any admin adjustment.
 * adjustment_reason: required when amount ≠ original_computed_amount.
 * needs_review: set when a ticket it covered is reopened (T042 / M-28); admin clears it.
 */

import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { businessDays } from "./business-days";
import { ticketItems } from "./ticket-items";
import { productPieces } from "./products";
import { paymentMethodEnum } from "./enums";
import { unitReviews } from "./production";

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    originalComputedAmount: bigint("original_computed_amount", { mode: "number" }).notNull(),
    adjustmentReason: text("adjustment_reason"),
    method: paymentMethodEnum("method").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    notes: text("notes"),
    needsReview: boolean("needs_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_payouts_employee").on(table.employeeId)],
);

/** One row per business day covered by this payout.
 *  UNIQUE(employee_id, business_day_id) is the physical double-pay guard. */
export const payoutPeriodDays = pgTable(
  "payout_period_days",
  {
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    businessDayId: uuid("business_day_id")
      .notNull()
      .references(() => businessDays.id, { onDelete: "restrict" }),
  },
  (table) => [
    unique("uq_payout_period_days_employee_day").on(table.employeeId, table.businessDayId),
    index("idx_payout_period_days_payout").on(table.payoutId),
    index("idx_payout_period_days_employee").on(table.employeeId),
  ],
);

/** Links a stylist payout to the specific ticket items it covers (T066) */
export const payoutTicketItems = pgTable(
  "payout_ticket_items",
  {
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id, { onDelete: "restrict" }),
    ticketItemId: uuid("ticket_item_id")
      .notNull()
      .references(() => ticketItems.id, { onDelete: "restrict" }),
  },
  (table) => [index("idx_payout_ticket_items_payout").on(table.payoutId)],
);

/** Links a clothier payout to the specific product pieces it covers (T066) */
export const payoutProductPieces = pgTable(
  "payout_craftable_pieces",
  {
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id, { onDelete: "restrict" }),
    productPieceId: uuid("craftable_piece_id")
      .notNull()
      .references(() => productPieces.id, { onDelete: "restrict" }),
  },
  (table) => [index("idx_payout_craftable_pieces_payout").on(table.payoutId)],
);

/**
 * T126 — links a clothier payout to the unit reviews it paid (approved units,
 * plus scrapped units when the review was marked paid). UNIQUE(unit_review_id):
 * a review is paid once, whatever day ranges are settled.
 */
export const payoutUnitReviews = pgTable(
  "payout_unit_reviews",
  {
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id, { onDelete: "restrict" }),
    unitReviewId: uuid("unit_review_id")
      .notNull()
      .references(() => unitReviews.id, { onDelete: "restrict" }),
  },
  (table) => [
    unique("uq_payout_unit_reviews_review").on(table.unitReviewId),
    index("idx_payout_unit_reviews_payout").on(table.payoutId),
  ],
);
