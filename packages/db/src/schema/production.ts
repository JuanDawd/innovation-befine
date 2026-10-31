/**
 * Pedido production — T112 (spec: docs/Business/pedidos-spec.md §3.2, §3.3, §4)
 *
 * Work is counted in units per pedido_line_cell.
 *
 * assignments: units of one cell given to (or claimed by) one clothier, with
 *   the piece rate copied at creation. quantity may drop to 0 when every unit
 *   is released; the row stays for history.
 * unit_reports: units a clothier says are finished. kind 'report' = first time,
 *   'rework' = units that were returned and are finished again.
 * unit_reviews: secretary/admin decision on reported units — approved,
 *   returned (rework, reason required) or scrapped (reason required).
 * clothier_day_closings: "Cerrar mi jornada", one per clothier per business day.
 * deliveries + delivery_cells: units handed over, per cell.
 *
 * Unit limits that span rows are enforced by triggers (migration
 * 0042_production_unit_guards.sql), which lock the parent row so two
 * concurrent writers cannot both pass:
 *   - Σ live assigned units per cell (quantity − scrapped) ≤ cell quantity
 *   - Σ 'report' units per assignment ≤ assignment quantity
 *   - Σ 'rework' units per assignment ≤ Σ returned
 *   - Σ reviewed (approved + returned + scrapped) per assignment ≤ Σ reported
 *   - Σ delivered per cell ≤ Σ approved per cell, and the cell belongs to the
 *     delivery's pedido
 * Per-cell progress is derived (queries/pedido-progress.ts), never stored.
 */

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { employees } from "./employees";
import { businessDays } from "./business-days";
import { pedidos, pedidoLineCells } from "./pedidos";

export const assignmentSourceEnum = pgEnum("assignment_source_enum", ["assigned", "claimed"]);

export const unitReportKindEnum = pgEnum("unit_report_kind_enum", ["report", "rework"]);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => pedidoLineCells.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    /**
     * T120 — approved units a restructure took out of the pedido. They stay
     * reviewed (the clothier stays paid) but no longer count on the cell.
     */
    movedOut: integer("moved_out").notNull().default(0),
    /** Whole COP paid per approved unit — copied from the variant at creation */
    pieceRate: bigint("piece_rate", { mode: "number" }).notNull(),
    /** Why the admin changed this assignment's rate (rush, embroidery) */
    rateReason: text("rate_reason"),
    source: assignmentSourceEnum("source").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_assignments_cell").on(t.cellId),
    index("idx_assignments_employee").on(t.employeeId),
    check("chk_assignments_quantity", sql`${t.quantity} >= 0`),
    check("chk_assignments_moved_out", sql`${t.movedOut} >= 0`),
    check("chk_assignments_piece_rate", sql`${t.pieceRate} >= 0`),
  ],
);

export const unitReports = pgTable(
  "unit_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    kind: unitReportKindEnum("kind").notNull().default("report"),
    businessDayId: uuid("business_day_id")
      .notNull()
      .references(() => businessDays.id, { onDelete: "restrict" }),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /**
     * T123 — client-generated per tap; a report queued offline and replayed
     * is recorded once. One tap may write a rework row and a report row, so
     * the key carries the kind as a suffix.
     */
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_unit_reports_assignment").on(t.assignmentId),
    index("idx_unit_reports_business_day").on(t.businessDayId),
    check("chk_unit_reports_quantity", sql`${t.quantity} >= 1`),
  ],
);

export const unitReviews = pgTable(
  "unit_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "restrict" }),
    approved: integer("approved").notNull().default(0),
    returned: integer("returned").notNull().default(0),
    scrapped: integer("scrapped").notNull().default(0),
    /** Free-text note for returned units (or for both, on rows before T124) */
    reason: text("reason"),
    /** T124 — defect code for returned units (DEFECT_CODES in @befine/types), for analytics */
    returnCode: text("return_code"),
    /** T124 — why units were scrapped: code + optional note */
    scrapCode: text("scrap_code"),
    scrapReason: text("scrap_reason"),
    /**
     * T124 — whether these scrapped units are paid, copied from the
     * pay_scrapped_units setting at review time so a later change of the
     * setting never rewrites past pay.
     */
    scrapPaid: boolean("scrap_paid").notNull().default(false),
    /** T124 — client-generated per submit: a double tap records one review */
    idempotencyKey: text("idempotency_key").unique(),
    businessDayId: uuid("business_day_id")
      .notNull()
      .references(() => businessDays.id, { onDelete: "restrict" }),
    reviewedBy: uuid("reviewed_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_unit_reviews_assignment").on(t.assignmentId),
    index("idx_unit_reviews_business_day").on(t.businessDayId),
    check(
      "chk_unit_reviews_counts",
      sql`${t.approved} >= 0 AND ${t.returned} >= 0 AND ${t.scrapped} >= 0
        AND ${t.approved} + ${t.returned} + ${t.scrapped} >= 1`,
    ),
    check(
      "chk_unit_reviews_reason",
      sql`(${t.returned} = 0 OR coalesce(${t.returnCode}, ${t.reason}) IS NOT NULL)
        AND (${t.scrapped} = 0 OR coalesce(${t.scrapCode}, ${t.scrapReason}, ${t.reason}) IS NOT NULL)`,
    ),
    index("idx_unit_reviews_return_code").on(t.returnCode),
  ],
);

export const clothierDayClosings = pgTable(
  "clothier_day_closings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    businessDayId: uuid("business_day_id")
      .notNull()
      .references(() => businessDays.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    approvedBy: uuid("approved_by").references(() => employees.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Set when secretary/admin corrected the clothier's numbers */
    correctionReason: text("correction_reason"),
    /**
     * T125 — what she declared, per assignment, and any staff correction:
     * [{ assignmentId, pedidoNumber, garment, size, submitted, corrected }]
     * corrected is null unless staff changed that line.
     */
    lines: jsonb("lines")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Units she said she finished that day (before corrections) */
    submittedUnits: integer("submitted_units").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_clothier_day_closings_employee_day").on(t.employeeId, t.businessDayId),
    index("idx_clothier_day_closings_business_day").on(t.businessDayId),
    check("chk_clothier_day_closings_units", sql`${t.submittedUnits} >= 0`),
    check(
      "chk_clothier_day_closings_approval",
      sql`(${t.approvedBy} IS NULL) = (${t.approvedAt} IS NULL)`,
    ),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredBy: uuid("delivered_by")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    note: text("note"),
    /** Client-generated (T121): a double tap records one delivery */
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_deliveries_pedido").on(t.pedidoId)],
);

export const deliveryCells = pgTable(
  "delivery_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "restrict" }),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => pedidoLineCells.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    uniqueIndex("idx_delivery_cells_delivery_cell").on(t.deliveryId, t.cellId),
    index("idx_delivery_cells_cell").on(t.cellId),
    check("chk_delivery_cells_quantity", sql`${t.quantity} >= 1`),
  ],
);
