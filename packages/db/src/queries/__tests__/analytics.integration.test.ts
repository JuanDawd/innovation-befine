import { it, expect } from "vitest";
import {
  dailyRevenueBreakdown,
  earningsByEmployee,
  employeeDayBreakdown,
  getBusinessDayIdsByPeriod,
  jobsCountByEmployee,
  revenueByPeriod,
} from "../analytics";
import {
  describeDb,
  makeAbsence,
  makeClothSale,
  makeClothVariant,
  makeDay,
  makeEmployee,
  makeProduct,
  makeTicket,
  makeVariant,
  withCleanDb,
} from "./helpers/test-db";

// M-70b — analytics queries against a real Postgres, with known inputs and
// pre-computed expected outputs (integer pesos).

describeDb("revenueByPeriod", () => {
  it("sums closed service revenue, sold pieces and cloth sales; ignores everything else", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db);
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      const other = await makeDay(db, "2026-10-21T13:00:00Z");
      const v = await makeVariant(db);
      const base = { dayId: day, employeeId: stylist.id, variantId: v };

      await makeTicket(db, { ...base, unitPrice: 50_000 }); // 50.000
      await makeTicket(db, { ...base, unitPrice: 30_000, quantity: 2 }); // 60.000
      await makeTicket(db, { ...base, unitPrice: 40_000, overridePrice: 0 }); // override to $0
      await makeTicket(db, { ...base, unitPrice: 99_000, status: "awaiting_payment" });
      await makeTicket(db, { ...base, unitPrice: 99_000, status: "voided" });
      await makeTicket(db, { ...base, unitPrice: 99_000, needsReview: true });
      await makeTicket(db, { ...base, dayId: other, unitPrice: 99_000 }); // other day

      const cloth = await makeClothVariant(db);
      await makeProduct(db, {
        dayId: day,
        createdBy: stylist.id,
        pieces: [
          { cloth, status: "approved", soldPrice: 70_000 },
          { cloth, status: "approved" }, // not sold
        ],
      });
      await makeClothSale(db, {
        dayId: day,
        soldBy: stylist.id,
        cloth,
        unitPrice: 95_000,
        quantity: 2,
      });
      await makeClothSale(db, {
        dayId: day,
        soldBy: stylist.id,
        cloth,
        unitPrice: 95_000,
        priceOverride: 80_000,
      });

      expect(await revenueByPeriod(db, [day])).toEqual({
        serviceRevenue: 110_000,
        productSalesRevenue: 70_000 + 190_000 + 80_000,
        totalRevenue: 110_000 + 340_000,
        totalJobs: 3,
      });
    }));

  it("is zero for a period with no activity", () =>
    withCleanDb(async (db) => {
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      expect(await revenueByPeriod(db, [day])).toEqual({
        totalRevenue: 0,
        serviceRevenue: 0,
        productSalesRevenue: 0,
        totalJobs: 0,
      });
    }));
});

describeDb("jobsCountByEmployee", () => {
  it("counts closed tickets per employee, busiest first, active only by default", () =>
    withCleanDb(async (db) => {
      const ana = await makeEmployee(db, { name: "Ana" });
      const bea = await makeEmployee(db, { name: "Bea" });
      const gone = await makeEmployee(db, { name: "Retirada", isActive: false });
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      const v = await makeVariant(db);
      for (const emp of [ana, bea, bea, gone])
        await makeTicket(db, { dayId: day, employeeId: emp.id, variantId: v });
      await makeTicket(db, { dayId: day, employeeId: ana.id, variantId: v, status: "logged" });

      const active = await jobsCountByEmployee(db, [day]);
      expect(active.map((r) => [r.employeeName, r.jobCount])).toEqual([
        ["Bea", 2],
        ["Ana", 1],
      ]);
      const all = await jobsCountByEmployee(db, [day], { activeOnly: false });
      expect(all.map((r) => r.employeeName).sort()).toEqual(["Ana", "Bea", "Retirada"]);
      expect(await jobsCountByEmployee(db, [])).toEqual([]);
    }));
});

describeDb("earningsByEmployee", () => {
  it("stylist commission uses banker's rounding per item, like payroll (M-77)", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db, { name: "Estilista" });
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      const v = await makeVariant(db);
      const base = { dayId: day, employeeId: stylist.id, variantId: v };
      // 25.005 × 10 % = 2.500,5 → 2.500 (half to even), not 2.501
      await makeTicket(db, { ...base, unitPrice: 25_005, commissionPct: "10.00" });
      // 25.015 × 10 % = 2.501,5 → 2.502 (half to even)
      await makeTicket(db, { ...base, unitPrice: 25_015, commissionPct: "10.00" });
      // 100 % and 0 % boundaries
      await makeTicket(db, { ...base, unitPrice: 12_000, commissionPct: "100.00" });
      await makeTicket(db, { ...base, unitPrice: 12_000, commissionPct: "0.00" });
      // override wins over unit price; quantity multiplies
      await makeTicket(db, { ...base, unitPrice: 50_000, overridePrice: 30_000, quantity: 2 });

      const [row] = await earningsByEmployee(db, [day]);
      expect(row).toEqual({
        employeeId: stylist.id,
        employeeName: "Estilista",
        role: "stylist",
        totalEarnings: 2_500 + 2_502 + 12_000 + 0 + 24_000,
        jobCount: 5,
        earningsBySource: { service: 41_002, pieceCreated: 0, workedDay: 0 },
      });
    }));

  it("clothier earns the piece rate for approved pieces only", () =>
    withCleanDb(async (db) => {
      const clothier = await makeEmployee(db, { name: "Confección", role: "clothier" });
      const admin = await makeEmployee(db, { role: "admin" });
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      const bata = await makeClothVariant(db, { pieceRate: 8_000 });
      const falda = await makeClothVariant(db, { pieceRate: 5_000 });
      await makeProduct(db, {
        dayId: day,
        createdBy: admin.id,
        pieces: [
          { cloth: bata, assignedTo: clothier.id, status: "approved", quantity: 3 },
          { cloth: falda, assignedTo: clothier.id, status: "approved" },
          { cloth: bata, assignedTo: clothier.id, status: "done_pending_approval" },
          { cloth: bata, assignedTo: clothier.id, status: "pending" },
          { cloth: bata, assignedTo: null, status: "approved" }, // unassigned
        ],
      });

      const rows = await earningsByEmployee(db, [day]);
      expect(rows).toEqual([
        {
          employeeId: clothier.id,
          employeeName: "Confección",
          role: "clothier",
          totalEarnings: 29_000, // Bata ×3 at 8.000 + Falda 5.000 — per garment (M-78)
          jobCount: 4,
          earningsBySource: { service: 0, pieceCreated: 29_000, workedDay: 0 },
        },
      ]);
    }));

  it("secretary: distinct dates × daily rate, capped per ISO week, vacations excluded", () =>
    withCleanDb(async (db) => {
      const sec = await makeEmployee(db, {
        name: "Secretaria",
        role: "secretary",
        dailyRate: 60_000,
        expectedWorkDays: 2,
      });
      const admin = await makeEmployee(db, { role: "admin" });
      // ISO week 43 of 2026: Mon 19 … Sun 25 (13:00 UTC = 08:00 Bogota)
      const mon = await makeDay(db, "2026-10-19T13:00:00Z");
      const tue = await makeDay(db, "2026-10-20T13:00:00Z");
      const tueReopened = await makeDay(db, "2026-10-20T20:00:00Z"); // same date again
      const wed = await makeDay(db, "2026-10-21T13:00:00Z");
      // Week 44: Mon 26 (vacation), Tue 27 (missed — still paid, by design)
      const nextMon = await makeDay(db, "2026-10-26T13:00:00Z");
      const nextTue = await makeDay(db, "2026-10-27T13:00:00Z");
      await makeAbsence(db, {
        employeeId: sec.id,
        createdBy: admin.id,
        date: "2026-10-26",
        type: "vacation",
      });
      await makeAbsence(db, {
        employeeId: sec.id,
        createdBy: admin.id,
        date: "2026-10-27",
        type: "missed",
      });

      const rows = await earningsByEmployee(db, [mon, tue, tueReopened, wed, nextMon, nextTue]);
      const row = rows.find((r) => r.employeeId === sec.id)!;
      // week 43: 3 distinct dates capped at 2; week 44: 1 (vacation excluded)
      expect(row.jobCount).toBe(3);
      expect(row.totalEarnings).toBe(180_000);
      expect(row.earningsBySource).toEqual({ service: 0, pieceCreated: 0, workedDay: 180_000 });
    }));

  it("skips a secretary without a daily rate and deactivated staff by default", () =>
    withCleanDb(async (db) => {
      await makeEmployee(db, { role: "secretary", dailyRate: undefined });
      const gone = await makeEmployee(db, { name: "Retirada", isActive: false });
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      const v = await makeVariant(db);
      await makeTicket(db, { dayId: day, employeeId: gone.id, variantId: v });

      expect(await earningsByEmployee(db, [day])).toEqual([]);
      const all = await earningsByEmployee(db, [day], { activeOnly: false });
      expect(all.map((r) => r.employeeName)).toEqual(["Retirada"]);
      expect(await earningsByEmployee(db, [])).toEqual([]);
    }));

  it("adds piece-rate earnings to a stylist who also completed cloth pieces", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db, { name: "Multitarea" });
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      const v = await makeVariant(db);
      await makeTicket(db, { dayId: day, employeeId: stylist.id, variantId: v, unitPrice: 50_000 });
      const bata = await makeClothVariant(db, { pieceRate: 8_000 });
      await makeProduct(db, {
        dayId: day,
        createdBy: stylist.id,
        pieces: [{ cloth: bata, assignedTo: stylist.id, status: "approved" }],
      });
      const [row] = await earningsByEmployee(db, [day]);
      expect(row).toEqual(
        expect.objectContaining({
          totalEarnings: 28_000,
          jobCount: 2,
          earningsBySource: { service: 20_000, pieceCreated: 8_000, workedDay: 0 },
        }),
      );
    }));

  it("orders employees by total earnings", () =>
    withCleanDb(async (db) => {
      const low = await makeEmployee(db, { name: "Baja" });
      const high = await makeEmployee(db, { name: "Alta" });
      const day = await makeDay(db, "2026-10-22T13:00:00Z");
      const v = await makeVariant(db);
      await makeTicket(db, { dayId: day, employeeId: low.id, variantId: v, unitPrice: 10_000 });
      await makeTicket(db, { dayId: day, employeeId: high.id, variantId: v, unitPrice: 90_000 });
      const rows = await earningsByEmployee(db, [day]);
      expect(rows.map((r) => r.employeeName)).toEqual(["Alta", "Baja"]);
    }));
});

describeDb("dailyRevenueBreakdown", () => {
  it("one row per day with service and product revenue, oldest first, Bogota dates", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db);
      // 02:00 UTC on the 22nd is the evening of the 21st in Bogota
      const d21 = await makeDay(db, "2026-10-22T02:00:00Z");
      const d20 = await makeDay(db, "2026-10-20T13:00:00Z");
      const v = await makeVariant(db);
      await makeTicket(db, { dayId: d21, employeeId: stylist.id, variantId: v, unitPrice: 40_000 });
      await makeTicket(db, { dayId: d20, employeeId: stylist.id, variantId: v, unitPrice: 10_000 });
      await makeTicket(db, { dayId: d20, employeeId: stylist.id, variantId: v, unitPrice: 15_000 });
      const cloth = await makeClothVariant(db);
      await makeClothSale(db, { dayId: d21, soldBy: stylist.id, cloth, unitPrice: 95_000 });
      await makeProduct(db, {
        dayId: d21,
        createdBy: stylist.id,
        pieces: [{ cloth, status: "approved", soldPrice: 5_000 }],
      });

      expect(await dailyRevenueBreakdown(db, [d20, d21])).toEqual([
        {
          businessDayId: d20,
          date: "2026-10-20",
          revenue: 25_000,
          serviceRevenue: 25_000,
          productSalesRevenue: 0,
          jobs: 2,
        },
        {
          businessDayId: d21,
          date: "2026-10-21",
          revenue: 140_000,
          serviceRevenue: 40_000,
          productSalesRevenue: 100_000,
          jobs: 1,
        },
      ]);
      expect(await dailyRevenueBreakdown(db, [])).toEqual([]);
    }));
});

describeDb("getBusinessDayIdsByPeriod", () => {
  it("day: today (open included) vs yesterday (closed only)", () =>
    withCleanDb(async (db) => {
      const yesterday = await makeDay(db, "2026-10-22T13:00:00Z");
      const today = await makeDay(db, "2026-10-23T13:00:00Z", { open: true });
      await makeDay(db, "2026-10-21T13:00:00Z");
      expect(await getBusinessDayIdsByPeriod(db, "day", "2026-10-23")).toEqual({
        current: [today],
        prior: [yesterday],
      });
    }));

  it("week: Monday–Sunday of this ISO week vs the previous one", () =>
    withCleanDb(async (db) => {
      const thisMon = await makeDay(db, "2026-10-19T13:00:00Z");
      const thisFri = await makeDay(db, "2026-10-23T13:00:00Z");
      const lastMon = await makeDay(db, "2026-10-12T13:00:00Z");
      const lastSun = await makeDay(db, "2026-10-18T13:00:00Z");
      await makeDay(db, "2026-10-11T13:00:00Z"); // two weeks back
      const res = await getBusinessDayIdsByPeriod(db, "week", "2026-10-23");
      expect(res.current.sort()).toEqual([thisMon, thisFri].sort());
      expect(res.prior.sort()).toEqual([lastMon, lastSun].sort());
    }));

  it("month: 1st through today vs the whole previous month", () =>
    withCleanDb(async (db) => {
      const oct1 = await makeDay(db, "2026-10-01T13:00:00Z");
      const oct23 = await makeDay(db, "2026-10-23T13:00:00Z");
      const sep1 = await makeDay(db, "2026-09-01T13:00:00Z");
      const sep30 = await makeDay(db, "2026-09-30T13:00:00Z");
      await makeDay(db, "2026-08-31T13:00:00Z");
      const res = await getBusinessDayIdsByPeriod(db, "month", "2026-10-23");
      expect(res.current.sort()).toEqual([oct1, oct23].sort());
      expect(res.prior.sort()).toEqual([sep1, sep30].sort());
    }));
});

describeDb("employeeDayBreakdown", () => {
  it("stylist: jobs and banker's-rounded commission per day", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db);
      const d1 = await makeDay(db, "2026-10-20T13:00:00Z");
      const d2 = await makeDay(db, "2026-10-21T13:00:00Z");
      const v = await makeVariant(db);
      await makeTicket(db, {
        dayId: d1,
        employeeId: stylist.id,
        variantId: v,
        unitPrice: 25_005,
        commissionPct: "10.00",
      });
      await makeTicket(db, { dayId: d2, employeeId: stylist.id, variantId: v, unitPrice: 50_000 });
      await makeTicket(db, {
        dayId: d2,
        employeeId: stylist.id,
        variantId: v,
        unitPrice: 50_000,
        status: "voided",
      });
      expect(await employeeDayBreakdown(db, stylist.id, [d1, d2])).toEqual([
        { businessDayId: d1, date: "2026-10-20", jobs: 1, earnings: 2_500 },
        { businessDayId: d2, date: "2026-10-21", jobs: 1, earnings: 20_000 },
      ]);
    }));

  it("clothier: approved pieces and piece-rate earnings per day", () =>
    withCleanDb(async (db) => {
      const clothier = await makeEmployee(db, { role: "clothier" });
      const day = await makeDay(db, "2026-10-21T13:00:00Z");
      const bata = await makeClothVariant(db, { pieceRate: 8_000 });
      await makeProduct(db, {
        dayId: day,
        createdBy: clothier.id,
        pieces: [
          { cloth: bata, assignedTo: clothier.id, status: "approved" },
          { cloth: bata, assignedTo: clothier.id, status: "approved", quantity: 2 },
          { cloth: bata, assignedTo: clothier.id, status: "pending" },
        ],
      });
      expect(await employeeDayBreakdown(db, clothier.id, [day])).toEqual([
        { businessDayId: day, date: "2026-10-21", jobs: 3, earnings: 24_000 },
      ]);
    }));

  it("secretary: one paid presence per date; vacation and the reopened session pay 0", () =>
    withCleanDb(async (db) => {
      const sec = await makeEmployee(db, { role: "secretary", dailyRate: 60_000 });
      const admin = await makeEmployee(db, { role: "admin" });
      const d1 = await makeDay(db, "2026-10-20T13:00:00Z");
      const d1b = await makeDay(db, "2026-10-20T20:00:00Z");
      const d2 = await makeDay(db, "2026-10-21T13:00:00Z");
      await makeAbsence(db, {
        employeeId: sec.id,
        createdBy: admin.id,
        date: "2026-10-21",
        type: "approved_absence",
      });
      expect(await employeeDayBreakdown(db, sec.id, [d1, d1b, d2])).toEqual([
        { businessDayId: d1, date: "2026-10-20", jobs: 1, earnings: 60_000 },
        { businessDayId: d1b, date: "2026-10-20", jobs: 0, earnings: 0 },
        { businessDayId: d2, date: "2026-10-21", jobs: 0, earnings: 0 },
      ]);
    }));

  it("returns nothing for an unknown employee or no days", () =>
    withCleanDb(async (db) => {
      const day = await makeDay(db, "2026-10-21T13:00:00Z");
      expect(await employeeDayBreakdown(db, crypto.randomUUID(), [day])).toEqual([]);
      const stylist = await makeEmployee(db);
      expect(await employeeDayBreakdown(db, stylist.id, [])).toEqual([]);
    }));
});
