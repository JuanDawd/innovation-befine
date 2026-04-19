/**
 * Services and service variants tables — T023
 *
 * services: top-level service category (e.g. "Haircut", "Manicure")
 * service_variants: priced options within a service (e.g. "Short", "Medium", "Long")
 *
 * Every service has at least one variant ("Standard" if no meaningful options exist).
 * customer_price: integer whole COP pesos (bigint).
 * commission_pct: numeric(5,2) — a rate, not money. 0.00–100.00.
 */

import {
  bigint,
  boolean,
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

export const serviceVariants = pgTable(
  "service_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Customer price in whole COP pesos — never floats */
    customerPrice: bigint("customer_price", { mode: "number" }).notNull(),
    /** Commission percentage paid to the stylist. numeric(5,2): 0.00–100.00 */
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "chk_service_variants_commission_pct",
      sql`${table.commissionPct} >= 0 AND ${table.commissionPct} <= 100`,
    ),
    check("chk_service_variants_customer_price", sql`${table.customerPrice} >= 0`),
  ],
);
