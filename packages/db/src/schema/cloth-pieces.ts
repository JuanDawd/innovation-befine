/**
 * Cloth pieces + variants — T026 (updated to support variants)
 *
 * cloth_pieces: garment family (e.g. "Bikini", "Blusa") — name/description only.
 * cloth_piece_variants: construction variant with its own piece_rate
 *   (e.g. "Dos piezas" $12.000, "Entera" $15.000).
 *
 * piece_rate lives on the variant, not the parent piece.
 * batch_pieces references cloth_piece_variant_id to capture the exact rate at batch time.
 */

import { bigint, boolean, check, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const clothPieces = pgTable("cloth_pieces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

export const clothPieceVariants = pgTable(
  "cloth_piece_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clothPieceId: uuid("cloth_piece_id")
      .notNull()
      .references(() => clothPieces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Piece rate in whole COP pesos paid to the clothier */
    pieceRate: bigint("piece_rate", { mode: "number" }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("chk_cloth_piece_variants_piece_rate", sql`${t.pieceRate} >= 0`),
    index("idx_cloth_piece_variants_piece").on(t.clothPieceId),
  ],
);
