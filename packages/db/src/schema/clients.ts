/**
 * Clients table — T029
 *
 * Stores saved clients (recurring customers with a record).
 * Guests (walk-ins) are handled separately via guest_name on tickets/appointments.
 *
 * no_show_count: incremented by T032b (Phase 5) when an appointment is marked no-show.
 * is_active: soft-deletion — archiving hides the client from search but preserves history.
 *
 * No unique constraint on phone/email — staff manages duplicates (per resolved decisions).
 */

import { boolean, check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    /** Number of times this client was a no-show. Incremented by T032b. */
    noShowCount: integer("no_show_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("chk_clients_no_show_count", sql`${table.noShowCount} >= 0`)],
);
