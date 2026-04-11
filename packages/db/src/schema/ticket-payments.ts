import { pgTable, uuid, bigint, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { paymentMethodEnum } from "./enums";
import { checkoutSessions } from "./tickets";

/**
 * ticket_payments — T039
 *
 * Records individual payment line items for a checkout session.
 * A session can have multiple rows (split payment — T039).
 * Sum of amounts must equal checkout_sessions.total_amount.
 */
export const ticketPayments = pgTable(
  "ticket_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "restrict" }),
    method: paymentMethodEnum("method").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("chk_ticket_payments_amount", sql`${t.amount} > 0`)],
);
