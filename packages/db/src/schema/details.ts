/**
 * Product details — T137
 *
 * details: what a product can vary by (Talla, Color, Estilo, Tela…), created by the admin.
 * detail_values: the list of a custom detail. Talla and Color keep their values in
 * garment_sizes and garment_colors, which production and stock reference directly;
 * `builtin` says which detail is which.
 * product_details: which details a cloth piece uses, and whether each is required.
 * product_detail_values: the values it comes in, when not all of them (all_values).
 * value_id has no foreign key because a built-in detail's values live elsewhere.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { clothPieces } from "./cloth-pieces";

export const details = pgTable(
  "details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** 'size' | 'color' | 'style' for the three that existing columns store; else null */
    builtin: text("builtin"),
    /** Different values are different stock items */
    splitsStock: boolean("splits_stock").notNull().default(false),
    /** A value not on the list may be typed; it is never counted as a stock item */
    allowFreeText: boolean("allow_free_text").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_details_name").on(sql`lower(${t.name})`),
    uniqueIndex("uq_details_builtin").on(t.builtin),
    check(
      "chk_details_builtin",
      sql`${t.builtin} IS NULL OR ${t.builtin} IN ('size', 'color', 'style')`,
    ),
  ],
);

export const detailValues = pgTable(
  "detail_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    detailId: uuid("detail_id")
      .notNull()
      .references(() => details.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_detail_values_label").on(t.detailId, sql`lower(${t.label})`)],
);

export const productDetails = pgTable(
  "product_details",
  {
    clothPieceId: uuid("cloth_piece_id")
      .notNull()
      .references(() => clothPieces.id, { onDelete: "restrict" }),
    detailId: uuid("detail_id")
      .notNull()
      .references(() => details.id, { onDelete: "restrict" }),
    required: boolean("required").notNull().default(false),
    /** Every value of the detail applies, including ones added later */
    allValues: boolean("all_values").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clothPieceId, t.detailId] })],
);

export const productDetailValues = pgTable(
  "product_detail_values",
  {
    clothPieceId: uuid("cloth_piece_id")
      .notNull()
      .references(() => clothPieces.id, { onDelete: "restrict" }),
    detailId: uuid("detail_id")
      .notNull()
      .references(() => details.id, { onDelete: "restrict" }),
    valueId: uuid("value_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.clothPieceId, t.detailId, t.valueId] })],
);
