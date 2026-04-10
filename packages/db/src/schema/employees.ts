/**
 * Employees table — T012
 *
 * One row per employee, linked 1-to-1 with a Better Auth user.
 * Stylists have a subtype (informational, no permission differences).
 * Secretaries use daily_rate for payroll; stylists use commission (stored per ticket item).
 * expected_work_days supports part-time employees (e.g. 3 days/week).
 */

import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

export const stylistSubtypeEnum = pgEnum("stylist_subtype_enum", [
  "hairdresser",
  "manicurist",
  "masseuse",
  "makeup_artist",
  "spa_manager",
]);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    stylistSubtype: stylistSubtypeEnum("stylist_subtype"),
    /** Daily rate in whole COP pesos — only set for secretaries */
    dailyRate: integer("daily_rate"),
    /**
     * Number of expected work days per week (1–7, default 6).
     * Used by payroll (T065) to compute secretary earnings for part-time employees.
     */
    expectedWorkDays: integer("expected_work_days").notNull().default(6),
    /** Whether the employee can view their own earnings in the app */
    showEarnings: boolean("show_earnings").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    hiredAt: timestamp("hired_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_employees_user_id").on(table.userId),
    check(
      "chk_employees_expected_work_days",
      sql`${table.expectedWorkDays} >= 1 AND ${table.expectedWorkDays} <= 7`,
    ),
  ],
);
