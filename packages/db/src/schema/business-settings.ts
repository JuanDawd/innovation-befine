/**
 * Business settings table — T108
 *
 * Single-row table for admin-configurable behavior flags.
 * The CHECK constraint enforces at most one row (id must be a fixed sentinel UUID).
 * New settings are added as typed columns via migrations — never as key-value pairs.
 */

import { boolean, check, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Sentinel UUID for the single business_settings row — never changes */
export const BUSINESS_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export const businessSettings = pgTable(
  "business_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * When true, stylists can only log services matching their subtype.
     * When false (default), all services are available; UI prioritises subtype-matching ones.
     */
    enforceSubtypeServiceRestriction: boolean("enforce_subtype_service_restriction")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "chk_business_settings_single_row",
      sql`${table.id} = '00000000-0000-0000-0000-000000000001'`,
    ),
  ],
);
