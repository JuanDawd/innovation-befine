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
    /**
     * When false (default), employees must register with an email address.
     * When true, employees may register with a nickname/username instead.
     */
    employeeAuthRequiresEmail: boolean("employee_auth_requires_email").notNull().default(true),
    /**
     * When false (default), the cashier role cannot access /admin URLs.
     * When true, cashier role is granted read/write access to /admin routes.
     * Enforced in middleware with ~60 s TTL cache.
     */
    cashierCanAccessAdmin: boolean("cashier_can_access_admin").notNull().default(false),
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
