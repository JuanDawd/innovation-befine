/**
 * Actividad and Historial — T132 (spec §3.9.28)
 *
 * Reads activity_log newest first with keyset pagination on (created_at, id),
 * so page 500 costs the same as page 1. Every filter maps to an index from
 * migration 0045: actor → idx_activity_log_actor, action → idx_activity_log_action,
 * record → idx_activity_log_entity, time → idx_activity_log_created.
 */

import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../index";
import { ACTIVITY_ACTIONS } from "../activity-log";

/** Action families shown as one filter option (prefix "x." = every x.* action). */
const CATEGORY_PREFIXES = {
  money: [
    "checkout.",
    "pedido.payment",
    "pedido.refund",
    "pedido.payment_attach",
    "ticket.price_override",
    "ticket.reopen",
    "payroll.",
  ],
  pedidos: ["pedido.create", "pedido.update", "pedido.cancel", "pedido.deliver"],
  production: ["production."],
  stock: ["stock."],
  tickets: ["ticket."],
  day: ["day."],
  people: ["employee.", "client."],
  appointments: ["appointment."],
  catalog: ["catalog.", "settings."],
  auth: ["auth."],
} as const;

/**
 * Exact action names per category. Matching with = ANY(...) keeps
 * idx_activity_log_action usable under any collation (LIKE 'x.%' needs C).
 */
export const ACTIVITY_CATEGORIES = Object.fromEntries(
  Object.entries(CATEGORY_PREFIXES).map(([cat, prefixes]) => [
    cat,
    ACTIVITY_ACTIONS.filter((a) =>
      (prefixes as readonly string[]).some((p) => (p.endsWith(".") ? a.startsWith(p) : a === p)),
    ),
  ]),
) as Record<keyof typeof CATEGORY_PREFIXES, string[]>;
export type ActivityCategory = keyof typeof CATEGORY_PREFIXES;

export type ActivityRecord = { entityType: string; entityId: string };

export type ActivityFilters = {
  actorUserId?: string;
  category?: ActivityCategory;
  /** Inclusive, YYYY-MM-DD in America/Bogota */
  from?: string;
  to?: string;
  /** Entries about these records (OR) */
  records?: ActivityRecord[];
};

export type ActivityCursor = { createdAt: string; id: string };

export type ActivityRow = {
  id: string;
  createdAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
  reason: string | null;
};

export type ActivityPage = { rows: ActivityRow[]; next: ActivityCursor | null };

const bogotaStart = (date: string) => `${date}T00:00:00-05:00`;
const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export async function listActivity(
  db: Database,
  filters: ActivityFilters,
  opts: { cursor?: ActivityCursor | null; limit?: number } = {},
): Promise<ActivityPage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where: SQL[] = [];
  if (filters.actorUserId) where.push(sql`a.actor_user_id = ${filters.actorUserId}`);
  if (filters.category) {
    const actions = ACTIVITY_CATEGORIES[filters.category];
    where.push(
      sql`a.action IN (${sql.join(
        actions.map((x) => sql`${x}`),
        sql`, `,
      )})`,
    );
  }
  if (filters.from) where.push(sql`a.created_at >= ${bogotaStart(filters.from)}::timestamptz`);
  if (filters.to) where.push(sql`a.created_at < ${bogotaStart(nextDay(filters.to))}::timestamptz`);
  if (filters.records) {
    if (filters.records.length === 0) return { rows: [], next: null };
    where.push(
      sql`(${sql.join(
        filters.records.map(
          (r) => sql`(a.entity_type = ${r.entityType} AND a.entity_id = ${r.entityId})`,
        ),
        sql` OR `,
      )})`,
    );
  }
  if (opts.cursor)
    where.push(
      sql`(a.created_at, a.id) < (${opts.cursor.createdAt}::timestamptz, ${opts.cursor.id}::uuid)`,
    );

  const res = await db.execute(sql`
    SELECT a.id, a.created_at, a.actor_user_id, u.name AS actor_name, a.actor_role, a.action,
      a.entity_type, a.entity_id, a.summary, a.before, a.after, a.reason
    FROM activity_log a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${limit + 1}
  `);
  const raw = res.rows as {
    id: string;
    created_at: string | Date;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_role: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    summary: string;
    before: unknown;
    after: unknown;
    reason: string | null;
  }[];
  const page = raw.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at),
      actorUserId: r.actor_user_id,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      summary: r.summary,
      before: r.before,
      after: r.after,
      reason: r.reason,
    })),
    next:
      raw.length > limit && last
        ? { createdAt: new Date(last.created_at).toISOString(), id: last.id }
        : null,
  };
}

/**
 * The records whose entries make up a client's Historial: the client, its
 * pedidos and its tickets.
 */
export async function clientRecords(db: Database, clientIds: string[]): Promise<ActivityRecord[]> {
  if (clientIds.length === 0) return [];
  const ids = sql.join(
    clientIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const res = await db.execute(sql`
    SELECT 'client' AS t, id::text FROM clients WHERE id IN (${ids})
    UNION ALL SELECT 'pedido', id::text FROM pedidos WHERE client_id IN (${ids})
    UNION ALL SELECT 'ticket', id::text FROM tickets WHERE client_id IN (${ids})
  `);
  return (res.rows as { t: string; id: string }[]).map((r) => ({
    entityType: r.t,
    entityId: r.id,
  }));
}

/** A pedido's records: the pedido itself. Pedido number → id. */
export async function pedidoRecordByNumber(
  db: Database,
  number: number,
): Promise<ActivityRecord[]> {
  const res = await db.execute(sql`SELECT id::text FROM pedidos WHERE number = ${number}`);
  return (res.rows as { id: string }[]).map((r) => ({ entityType: "pedido", entityId: r.id }));
}
