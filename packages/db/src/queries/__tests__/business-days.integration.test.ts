import { it, expect } from "vitest";
import { describeDb, makeDay, makeEmployee, withCleanDb } from "./helpers/test-db";

// H-48: the database itself must refuse a second open business day.

describeDb("business_days", () => {
  it("rejects a second open day", () =>
    withCleanDb(async (db) => {
      const admin = await makeEmployee(db, { role: "admin" });
      await makeDay(db, "2026-10-30T13:00:00Z", { open: true, openedBy: admin.userId });
      await expect(
        makeDay(db, "2026-10-31T13:00:00Z", { open: true, openedBy: admin.userId }),
      ).rejects.toThrow();
    }));

  it("allows any number of closed days alongside one open day", () =>
    withCleanDb(async (db) => {
      const admin = await makeEmployee(db, { role: "admin" });
      await makeDay(db, "2026-10-29T13:00:00Z", { openedBy: admin.userId });
      await makeDay(db, "2026-10-30T13:00:00Z", { openedBy: admin.userId });
      await expect(
        makeDay(db, "2026-10-31T13:00:00Z", { open: true, openedBy: admin.userId }),
      ).resolves.toBeDefined();
    }));
});
