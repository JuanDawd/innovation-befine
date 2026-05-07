import { check, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orderItems } from "./large-orders";
import { productPieces } from "./products";
import { employees } from "./employees";

export const clothPieceAssignments = pgTable(
  "cloth_piece_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    productPieceId: uuid("craftable_piece_id")
      .notNull()
      .references(() => productPieces.id, { onDelete: "restrict" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    assignedQuantity: integer("assigned_quantity").notNull(),
    completedQuantity: integer("completed_quantity").notNull().default(0),
    approvedQuantity: integer("approved_quantity").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("chk_cpa_assigned_quantity", sql`${t.assignedQuantity} >= 1`),
    check("chk_cpa_completed_quantity", sql`${t.completedQuantity} >= 0`),
    check("chk_cpa_approved_quantity", sql`${t.approvedQuantity} >= 0`),
    check("chk_cpa_completed_lte_assigned", sql`${t.completedQuantity} <= ${t.assignedQuantity}`),
    check("chk_cpa_approved_lte_completed", sql`${t.approvedQuantity} <= ${t.completedQuantity}`),
    index("idx_cpa_order_item").on(t.orderItemId),
    index("idx_cpa_assignee").on(t.assigneeId),
  ],
);
