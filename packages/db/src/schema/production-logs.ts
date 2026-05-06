import { check, date, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clothPieceAssignments } from "./assignments";
import { employees } from "./employees";

export const productionLogs = pgTable(
  "production_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => clothPieceAssignments.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    loggedDate: date("logged_date").notNull(),
    loggedBy: uuid("logged_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("chk_production_logs_quantity", sql`${t.quantity} >= 1`),
    index("idx_production_logs_assignment").on(t.assignmentId, t.loggedDate),
  ],
);
