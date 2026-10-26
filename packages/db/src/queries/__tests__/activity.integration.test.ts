import { it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { ACTIVITY_CATEGORIES, listActivity } from "../activity";
import { describeDb, makeUser, withCleanDb } from "./helpers/test-db";

// T132 — the Actividad timeline over 100k+ entries: keyset pages, every
// filter served by an index.

type Db = Parameters<Parameters<typeof withCleanDb>[0]>[0];

async function fill(db: Db, n: number, actor: string) {
  // Spread over ~200 days, a mix of actions and records.
  await db.execute(sql`
    INSERT INTO activity_log (actor_user_id, actor_role, action, entity_type, entity_id, summary, created_at)
    SELECT CASE WHEN g % 10 = 0 THEN ${actor} ELSE NULL END, 'admin',
      (ARRAY['ticket.create','checkout.complete','pedido.payment','production.review','stock.sale','auth.sign_in'])[1 + g % 6],
      CASE WHEN g % 6 IN (2, 3) THEN 'pedido' ELSE 'ticket' END,
      'rec-' || (g % 5000), 'entrada ' || g,
      timestamptz '2026-10-25 12:00:00-05' - (g || ' minutes')::interval * 3
    FROM generate_series(1, ${n}) AS g`);
  await db.execute(sql`ANALYZE activity_log`);
}

async function plan(db: Db, query: ReturnType<typeof sql>) {
  const res = await db.execute(sql`EXPLAIN ${query}`);
  return (res.rows as Record<string, string>[]).map((r) => Object.values(r)[0]).join("\n");
}

describeDb("listActivity at scale", () => {
  it("pages 100k entries newest first without repeating or skipping", () =>
    withCleanDb(async (db) => {
      const actor = await makeUser(db, "Admin");
      await fill(db, 100_000, actor);

      const first = await listActivity(db, {}, { limit: 50 });
      expect(first.rows).toHaveLength(50);
      const second = await listActivity(db, {}, { cursor: first.next, limit: 50 });
      expect(second.rows[0]!.createdAt.getTime()).toBeLessThanOrEqual(
        first.rows.at(-1)!.createdAt.getTime(),
      );
      expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(100);

      // Deep page: the cursor seeks, so it costs about the same as page 1.
      let cursor = first.next;
      for (let i = 0; i < 5; i++)
        cursor = (await listActivity(db, {}, { cursor, limit: 200 })).next;
      const t0 = performance.now();
      const deep = await listActivity(db, { actorUserId: actor }, { cursor, limit: 50 });
      expect(deep.rows.every((r) => r.actorUserId === actor)).toBe(true);
      expect(performance.now() - t0).toBeLessThan(3_000);
    }));

  it("serves each filter from an index", () =>
    withCleanDb(async (db) => {
      const actor = await makeUser(db, "Admin");
      await fill(db, 100_000, actor);
      await db.execute(sql`SET LOCAL enable_seqscan = off`); // fail loudly if no index applies

      const byActor = await plan(
        db,
        sql`SELECT id FROM activity_log WHERE actor_user_id = ${actor} ORDER BY created_at DESC LIMIT 51`,
      );
      expect(byActor).toMatch(/idx_activity_log_actor/);
      const byRecord = await plan(
        db,
        sql`SELECT id FROM activity_log WHERE entity_type = 'pedido' AND entity_id = 'rec-7' ORDER BY created_at DESC LIMIT 51`,
      );
      expect(byRecord).toMatch(/idx_activity_log_entity/);
      const actions = sql.join(
        ACTIVITY_CATEGORIES.money.map((a) => sql`${a}`),
        sql`, `,
      );
      const byCategory = await plan(
        db,
        sql`SELECT id FROM activity_log WHERE action IN (${actions}) ORDER BY created_at DESC LIMIT 51`,
      );
      expect(byCategory).toMatch(/idx_activity_log_(action|created)/);
      const timeline = await plan(
        db,
        sql`SELECT id FROM activity_log ORDER BY created_at DESC, id DESC LIMIT 51`,
      );
      expect(timeline).toMatch(/idx_activity_log_created/);

      const pedidoMoney = await listActivity(db, {
        category: "money",
        records: [{ entityType: "pedido", entityId: "rec-2" }],
      });
      expect(pedidoMoney.rows.length).toBeGreaterThan(0);
      expect(
        pedidoMoney.rows.every((r) => r.action === "pedido.payment" && r.entityId === "rec-2"),
      ).toBe(true);
    }));

  it("filters by Bogotá date range, inclusive", () =>
    withCleanDb(async (db) => {
      const actor = await makeUser(db, "Admin");
      await fill(db, 2_000, actor);
      const day = await listActivity(db, { from: "2026-10-24", to: "2026-10-24" }, { limit: 200 });
      expect(day.rows.length).toBeGreaterThan(0);
      for (const r of day.rows) {
        const bogota = r.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
        expect(bogota).toBe("2026-10-24");
      }
    }));
});
