/**
 * Catalog audit log table — T025
 *
 * Tracks all create/update/soft-delete operations on catalog entities
 * (services, service_variants, cloth_pieces) for compliance and traceability.
 *
 * entity_type: which catalog table was changed
 * entity_id: the uuid of the affected row
 * action: 'create' | 'update' | 'soft_delete' | 'restore'
 * changed_by: FK to the user who made the change
 * previous_data / new_data: JSONB snapshots for diffing
 */

import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const catalogEntityTypeEnum = pgEnum("catalog_entity_type", [
  "service",
  "service_variant",
  "cloth_piece",
]);

export const catalogActionEnum = pgEnum("catalog_action", [
  "create",
  "update",
  "soft_delete",
  "restore",
]);

export const catalogAuditLog = pgTable("catalog_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: catalogEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: catalogActionEnum("action").notNull(),
  /** text, not uuid — Better Auth uses text PKs for users */
  changedBy: text("changed_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  /** Snapshot of the row before the change (null for create) */
  previousData: jsonb("previous_data"),
  /** Snapshot of the row after the change (null for hard delete — never used here) */
  newData: jsonb("new_data"),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
