/**
 * Activity log — T114 (spec: docs/Business/pedidos-spec.md §3.9)
 *
 * One immutable record of who did what, when, on which business day. Replaces
 * the old catalog audit table (its rows were copied here by migration 0046).
 *
 * Written only through logActivity() (src/activity-log.ts), inside the same
 * transaction as the action it describes — a failed action leaves no entry.
 * A trigger rejects UPDATE and DELETE (0046_activity_log_immutable.sql).
 *
 * action / entity_type are text, not enums: the list grows with every phase
 * and the TypeScript unions in src/activity-log.ts are the source of truth.
 * entity_id is text because users have text ids (Better Auth).
 */

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businessDays } from "./business-days";

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for a failed sign-in with an unknown email */
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role"),
    /** The business day open when it happened (null if none was) */
    businessDayId: uuid("business_day_id").references(() => businessDays.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** Spanish one-liner shown in Actividad and Historial */
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_activity_log_created").on(t.createdAt.desc(), t.id.desc()),
    index("idx_activity_log_actor").on(t.actorUserId, t.createdAt.desc()),
    index("idx_activity_log_entity").on(t.entityType, t.entityId, t.createdAt.desc()),
    index("idx_activity_log_action").on(t.action, t.createdAt.desc()),
    index("idx_activity_log_business_day").on(t.businessDayId),
  ],
);
