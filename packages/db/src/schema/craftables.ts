import {
  pgEnum,
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  index,
  bigint,
} from "drizzle-orm/pg-core";
import { businessDays } from "./business-days";
import { employees } from "./employees";
import { clothPieces, clothPieceVariants } from "./cloth-pieces";
import { largeOrders } from "./large-orders";

export const craftablePieceStatusEnum = pgEnum("craftable_piece_status_enum", [
  "pending",
  "done_pending_approval",
  "approved",
]);

export const craftableClaimSourceEnum = pgEnum("craftable_claim_source_enum", [
  "assigned",
  "self_claimed",
]);

export const craftableSourceEnum = pgEnum("craftable_source_enum", ["manual", "large_order"]);

export const craftables = pgTable("craftables", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessDayId: uuid("business_day_id")
    .notNull()
    .references(() => businessDays.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  notes: text("notes"),
  largeOrderId: uuid("large_order_id").references(() => largeOrders.id, { onDelete: "restrict" }),
  source: craftableSourceEnum("source").notNull().default("manual"),
  autoApproved: boolean("auto_approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const craftablePieces = pgTable(
  "craftable_pieces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    craftableId: uuid("craftable_id")
      .notNull()
      .references(() => craftables.id, { onDelete: "restrict" }),
    clothPieceId: uuid("cloth_piece_id")
      .notNull()
      .references(() => clothPieces.id, { onDelete: "restrict" }),
    clothPieceVariantId: uuid("cloth_piece_variant_id")
      .notNull()
      .references(() => clothPieceVariants.id, { onDelete: "restrict" }),
    assignedToEmployeeId: uuid("assigned_to_employee_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    claimSource: craftableClaimSourceEnum("claim_source"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    status: craftablePieceStatusEnum("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => employees.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    quantity: integer("quantity").notNull().default(1),
    color: varchar("color", { length: 80 }),
    style: varchar("style", { length: 80 }),
    size: varchar("size", { length: 40 }),
    instructions: text("instructions"),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    soldPrice: bigint("sold_price", { mode: "number" }),
    soldBy: uuid("sold_by").references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_craftable_pieces_employee_status").on(t.assignedToEmployeeId, t.status),
    index("idx_craftable_pieces_craftable_id").on(t.craftableId),
    index("idx_craftable_pieces_sold_at").on(t.soldAt),
  ],
);
