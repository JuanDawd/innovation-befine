import { pgEnum, pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { businessDays } from "./business-days";
import { employees } from "./employees";
import { clothPieces } from "./cloth-pieces";
import { largeOrders } from "./large-orders";

export const batchPieceStatusEnum = pgEnum("batch_piece_status_enum", [
  "pending",
  "done_pending_approval",
  "approved",
]);

export const claimSourceEnum = pgEnum("claim_source_enum", ["assigned", "self_claimed"]);

/**
 * cloth_batches — T044
 * A batch groups cloth pieces assigned to clothiers for a given business day.
 * large_order_id is nullable — standalone batches are allowed (linked in Phase 6).
 */
export const clothBatches = pgTable("cloth_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessDayId: uuid("business_day_id")
    .notNull()
    .references(() => businessDays.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  notes: text("notes"),
  largeOrderId: uuid("large_order_id").references(() => largeOrders.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * batch_pieces — T044
 * One row per cloth piece within a batch. Tracks assignment, self-claim, and approval.
 * Uses optimistic locking (version) to prevent two clothiers claiming the same piece.
 */
export const batchPieces = pgTable("batch_pieces", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => clothBatches.id, { onDelete: "restrict" }),
  clothPieceId: uuid("cloth_piece_id")
    .notNull()
    .references(() => clothPieces.id, { onDelete: "restrict" }),
  assignedToEmployeeId: uuid("assigned_to_employee_id").references(() => employees.id, {
    onDelete: "restrict",
  }),
  claimSource: claimSourceEnum("claim_source"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  status: batchPieceStatusEnum("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => employees.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
