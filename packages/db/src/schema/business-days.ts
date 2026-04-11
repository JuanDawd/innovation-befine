/**
 * Business days table — T019
 *
 * Tracks open/close lifecycle of each business day.
 * Only one day can be open at a time — enforced by a partial unique index
 * on a single-value expression when closed_at IS NULL (see migration).
 * This is a financial constraint and must be at the database level.
 *
 * Reopen: admin can reopen the most recently closed day with an audit trail.
 */

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const businessDays = pgTable("business_days", {
  id: uuid("id").primaryKey().defaultRandom(),
  openedAt: timestamp("opened_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { mode: "date", withTimezone: true }),
  openedBy: text("opened_by")
    .notNull()
    .references(() => users.id),
  closedBy: text("closed_by").references(() => users.id),
  /** Populated when a closed day is reopened — who reopened it */
  reopenedBy: text("reopened_by").references(() => users.id),
  /** Populated when a closed day is reopened — when it was reopened */
  reopenedAt: timestamp("reopened_at", { mode: "date", withTimezone: true }),
  /** Required reason provided by admin when reopening a closed day */
  reopenReason: text("reopen_reason"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
