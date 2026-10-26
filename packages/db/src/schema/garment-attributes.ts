/**
 * Garment sizes + colours — T110
 *
 * Admin-managed lists that pedido line cells, assignments and the stock ledger
 * reference (T111+). Never deleted: a deactivated size or colour disappears from
 * pickers but stays on the records that already use it.
 *
 * garment_sizes.sort_order drives the column order of the size grid.
 * garment_colors.hex is an optional swatch (#RRGGBB).
 */

import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const garmentSizes = pgTable(
  "garment_sizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_garment_sizes_label").on(sql`lower(${t.label})`)],
);

export const garmentColors = pgTable(
  "garment_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    hex: text("hex"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_garment_colors_label").on(sql`lower(${t.label})`),
    check("chk_garment_colors_hex", sql`${t.hex} IS NULL OR ${t.hex} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);
