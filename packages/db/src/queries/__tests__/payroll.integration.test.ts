import { it, expect } from "vitest";
import { getUnpaidPastBusinessDays } from "../payroll";
import { describeDb, makeDay, makeEmployee, makePayout, withCleanDb } from "./helpers/test-db";

describeDb("getUnpaidPastBusinessDays", () => {
  it("returns closed days without a covering payout, oldest first, in Bogota dates", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db);
      const admin = await makeEmployee(db, { role: "admin" });
      // 02:00 UTC on the 22nd is still the 21st in Bogota
      const d21 = await makeDay(db, "2026-10-22T02:00:00Z");
      const d20 = await makeDay(db, "2026-10-20T13:00:00Z");
      const d22 = await makeDay(db, "2026-10-22T13:00:00Z");
      await makePayout(db, { employeeId: stylist.id, recordedBy: admin.id, dayIds: [d20] });

      expect(await getUnpaidPastBusinessDays(db, stylist.id)).toEqual([
        { businessDayId: d21, date: "2026-10-21" },
        { businessDayId: d22, date: "2026-10-22" },
      ]);
    }));

  it("excludes the open business day", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db);
      const closed = await makeDay(db, "2026-10-22T13:00:00Z");
      await makeDay(db, "2026-10-23T13:00:00Z", { open: true });
      const days = await getUnpaidPastBusinessDays(db, stylist.id);
      expect(days.map((d) => d.businessDayId)).toEqual([closed]);
    }));

  it("is per employee — another employee's payout doesn't settle the day", () =>
    withCleanDb(async (db) => {
      const a = await makeEmployee(db);
      const b = await makeEmployee(db);
      const admin = await makeEmployee(db, { role: "admin" });
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      await makePayout(db, { employeeId: a.id, recordedBy: admin.id, dayIds: [day] });
      expect(await getUnpaidPastBusinessDays(db, a.id)).toEqual([]);
      expect((await getUnpaidPastBusinessDays(db, b.id)).map((d) => d.businessDayId)).toEqual([
        day,
      ]);
    }));

  it("returns nothing when no day has been closed", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db);
      await makeDay(db, "2026-10-23T13:00:00Z", { open: true });
      expect(await getUnpaidPastBusinessDays(db, stylist.id)).toEqual([]);
    }));
});
