import { it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as s from "../../schema";
import { logActivity, type ActivityTx } from "../../activity-log";
import { describeDb, makeDay, makeUser, withCleanDb } from "./helpers/test-db";

// T114 — activity_log entries live and die with the action's transaction,
// and nobody can edit or delete them.

type Db = Parameters<Parameters<typeof withCleanDb>[0]>[0];

const count = async (db: Db) =>
  Number((await db.execute(sql`SELECT count(*)::int AS n FROM activity_log`)).rows[0]!.n);

describeDb("logActivity", () => {
  it("commits with the action", () =>
    withCleanDb(async (db) => {
      const userId = await makeUser(db);
      await db.transaction(async (tx) => {
        await tx.insert(s.garmentSizes).values({ label: "XXXL" });
        await logActivity(tx as unknown as ActivityTx, {
          actor: { userId, role: "admin" },
          action: "catalog.create",
          entityType: "garment_size",
          data: { name: "XXXL" },
        });
      });
      const [row] = await db.select().from(s.activityLog);
      expect(row).toMatchObject({
        actorUserId: userId,
        actorRole: "admin",
        action: "catalog.create",
        summary: "Creó la talla «XXXL»",
      });
    }));

  it("rolls back with a failed action", () =>
    withCleanDb(async (db) => {
      const userId = await makeUser(db);
      await expect(
        db.transaction(async (tx) => {
          await logActivity(tx as unknown as ActivityTx, {
            actor: { userId, role: "admin" },
            action: "catalog.create",
            entityType: "garment_size",
            data: { name: "XS" },
          });
          // Violates idx_garment_sizes_label after the log entry was written.
          await tx.insert(s.garmentSizes).values([{ label: "XS" }, { label: "xs" }]);
        }),
      ).rejects.toThrow();
      expect(await count(db)).toBe(0);
    }));

  it("stamps the open business day by default, none when closed", () =>
    withCleanDb(async (db) => {
      const userId = await makeUser(db);
      await makeDay(db, "2026-10-20T13:00:00Z", { openedBy: userId });
      const entry = {
        actor: { userId, role: "admin" },
        action: "auth.sign_in" as const,
        entityType: "user" as const,
        entityId: userId,
      };
      await db.transaction((tx) => logActivity(tx as unknown as ActivityTx, entry));
      const open = await makeDay(db, "2026-10-21T13:00:00Z", { openedBy: userId, open: true });
      await db.transaction((tx) => logActivity(tx as unknown as ActivityTx, entry));

      const rows = await db
        .select({ businessDayId: s.activityLog.businessDayId })
        .from(s.activityLog)
        .where(eq(s.activityLog.entityId, userId))
        .orderBy(s.activityLog.createdAt);
      expect(rows.map((r) => r.businessDayId).sort()).toEqual([null, open].sort());
    }));

  it("rejects UPDATE and DELETE", () =>
    withCleanDb(async (db) => {
      const userId = await makeUser(db);
      await db.transaction((tx) =>
        logActivity(tx as unknown as ActivityTx, {
          actor: { userId, role: "admin" },
          action: "auth.sign_out",
          entityType: "user",
          entityId: userId,
        }),
      );
      await expect(
        db.transaction((tx) => tx.execute(sql`UPDATE activity_log SET summary = 'x'`)),
      ).rejects.toThrow();
      await expect(
        db.transaction((tx) => tx.execute(sql`DELETE FROM activity_log`)),
      ).rejects.toThrow();
      expect(await count(db)).toBe(1);
    }));
});
