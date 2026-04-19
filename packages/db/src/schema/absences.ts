/**
 * Employee absences — T020
 *
 * Tracks vacation, approved absences, and missed days per calendar date.
 * Used by T065 to compute secretary earnings (days present × daily_rate).
 */

import { date, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const absenceTypeEnum = pgEnum("absence_type_enum", [
  "vacation",
  "approved_absence",
  "missed",
]);

export const employeeAbsences = pgTable(
  "employee_absences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    type: absenceTypeEnum("type").notNull(),
    /** Calendar date — matched against business_days.opened_at date for payroll */
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("uq_employee_absences_employee_date").on(table.employeeId, table.date)],
);
