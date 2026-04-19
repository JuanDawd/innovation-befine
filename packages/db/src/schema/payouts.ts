/**
 * Payouts — T066
 *
 * payouts: one record per employee payment for a set of business days.
 * payout_ticket_items: links a stylist payout to the ticket items it covers.
 * payout_batch_pieces: links a clothier payout to the batch pieces it covers.
 *
 * period_business_day_ids: uuid array — the business_day IDs covered.
 * original_computed_amount: what the system computed before any admin adjustment.
 * adjustment_reason: required when amount ≠ original_computed_amount.
 */

import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { ticketItems } from "./ticket-items";
import { batchPieces } from "./cloth-batches";
import { paymentMethodEnum } from "./enums";

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    originalComputedAmount: bigint("original_computed_amount", { mode: "number" }).notNull(),
    adjustmentReason: text("adjustment_reason"),
    method: paymentMethodEnum("method").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    periodBusinessDayIds: uuid("period_business_day_ids").array().notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_payouts_employee").on(table.employeeId)],
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

/** Links a clothier payout to the specific batch pieces it covers (T066) */
export const payoutBatchPieces = pgTable(
  "payout_batch_pieces",
  {
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id, { onDelete: "restrict" }),
    batchPieceId: uuid("batch_piece_id")
      .notNull()
      .references(() => batchPieces.id, { onDelete: "restrict" }),
  },
  (table) => [index("idx_payout_batch_pieces_payout").on(table.payoutId)],
);
