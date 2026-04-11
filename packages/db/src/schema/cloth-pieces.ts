/**
 * Cloth pieces table — T026
 *
 * cloth_pieces: items produced by clothiers (e.g. "Blusa", "Falda")
 * Each piece has a fixed piece_rate paid to the clothier who produces it.
 *
 * piece_rate: integer whole COP pesos (bigint).
 */

import { bigint, boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const clothPieces = pgTable(
  "cloth_pieces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    /** Piece rate paid to the clothier in whole COP pesos — never floats */
    pieceRate: bigint("piece_rate", { mode: "number" }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("chk_cloth_pieces_piece_rate", sql`${table.pieceRate} >= 0`)],
);
