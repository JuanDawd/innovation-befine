/**
 * Notifications table — T048
 *
 * In-app notification system. Each row targets one employee.
 * - is_read: toggled when the employee opens/clicks the notification
 * - is_archived: set true after 7 days (auto-archive job) or manual dismiss
 * - type: used for grouping same-type notifications within a 5-min window
 * - link: optional href the bell dropdown navigates to on click
 */

import { pgTable, uuid, text, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const notificationTypeEnum = pgEnum("notification_type_enum", [
  "edit_request_approved",
  "edit_request_rejected",
  "ticket_reopened",
  "piece_assigned",
  "appointment_reminder",
  "price_changed",
  "generic",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientEmployeeId: uuid("recipient_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull().default("generic"),
    message: text("message").notNull(),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notifications_recipient_created").on(t.recipientEmployeeId, t.createdAt),
    index("idx_notifications_recipient_unread").on(t.recipientEmployeeId, t.isRead, t.isArchived),
  ],
);
