/**
 * idempotency_keys — T078
 *
 * Server-side idempotency store for mutating server actions.
 * key: client-generated UUID (sent as part of request payload).
 * route: identifies the action (e.g. "markPieceDone", "createTicket").
 * response_body: the exact ActionResult JSON returned on first execution.
 * expires_at: keys are cleaned up after 24 hours (lazy on lookup).
 */

import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  route: text("route").notNull(),
  responseBody: jsonb("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
