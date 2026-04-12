/**
 * ticket_edit_requests — T041
 *
 * Secretary and stylist submit an edit request to change a ticket item's
 * service variant. Cashier approves (updates the item) or rejects (no change).
 */

import { pgTable, uuid, pgEnum, timestamp, index } from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { ticketItems } from "./ticket-items";
import { serviceVariants } from "./services";

export const editRequestStatusEnum = pgEnum("edit_request_status_enum", [
  "pending",
  "approved",
  "rejected",
]);

export const ticketEditRequests = pgTable(
  "ticket_edit_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketItemId: uuid("ticket_item_id")
      .notNull()
      .references(() => ticketItems.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    newServiceVariantId: uuid("new_service_variant_id")
      .notNull()
      .references(() => serviceVariants.id, { onDelete: "restrict" }),
    status: editRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => employees.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("idx_edit_requests_item").on(t.ticketItemId),
    index("idx_edit_requests_status").on(t.status),
    index("idx_edit_requests_requester").on(t.requestedBy),
  ],
);
