import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { clients } from "./clients";
import { serviceVariants } from "./services";

/**
 * appointments — T049
 *
 * Booking record created by secretary or cashier_admin.
 * Either client_id (saved client) or guest_name must be present.
 * service_variant_id links to the catalog for auto-populating tickets;
 * when null, service_summary (free text) is used as a fallback.
 */
export const appointmentStatusEnum = pgEnum("appointment_status_enum", [
  "booked",
  "confirmed",
  "completed",
  "cancelled",
  "rescheduled",
  "no_show",
]);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),
    guestName: text("guest_name"),
    stylistEmployeeId: uuid("stylist_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    serviceVariantId: uuid("service_variant_id").references(() => serviceVariants.id, {
      onDelete: "restrict",
    }),
    serviceSummary: text("service_summary").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    status: appointmentStatusEnum("status").notNull().default("booked"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
    priceChangeAcknowledged: boolean("price_change_acknowledged").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_appointments_stylist_scheduled").on(table.stylistEmployeeId, table.scheduledAt),
    index("idx_appointments_scheduled_at").on(table.scheduledAt),
    index("idx_appointments_client").on(table.clientId),
    index("idx_appointments_status").on(table.status),
  ],
);
