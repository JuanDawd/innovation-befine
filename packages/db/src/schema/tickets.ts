import {
  pgEnum,
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  timestamp,
  integer,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { employees } from "./employees";
import { businessDays } from "./business-days";
import { clients } from "./clients";

export const ticketStatusEnum = pgEnum("ticket_status_enum", [
  "logged",
  "awaiting_payment",
  "closed",
  "reopened",
  "paid_offline",
]);

/**
 * checkout_sessions — T033
 * Groups multiple tickets into a single payment transaction.
 * Created in T033 (before tickets) because tickets FK references it.
 */
export const checkoutSessions = pgTable("checkout_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessDayId: uuid("business_day_id")
    .notNull()
    .references(() => businessDays.id, { onDelete: "restrict" }),
  cashierId: uuid("cashier_id")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
  isPartiallyReopened: boolean("is_partially_reopened").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * tickets — T033
 */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessDayId: uuid("business_day_id")
      .notNull()
      .references(() => businessDays.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),
    guestName: text("guest_name"),
    // appointment_id FK added in Phase 5 (T049) — column reserved here
    appointmentId: uuid("appointment_id"),
    checkoutSessionId: uuid("checkout_session_id").references(() => checkoutSessions.id, {
      onDelete: "restrict",
    }),
    status: ticketStatusEnum("status").notNull().default("logged"),
    idempotencyKey: text("idempotency_key").unique(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    /** Set true when a ticket is reopened after payout — excluded from future earnings until reviewed */
    needsReview: boolean("needs_review").notNull().default(false),
  },
  (t) => [
    // Either client_id or guest_name must be present
    check(
      "chk_tickets_client_or_guest",
      sql`${t.clientId} IS NOT NULL OR (${t.guestName} IS NOT NULL AND ${t.guestName} <> '')`,
    ),
  ],
);
