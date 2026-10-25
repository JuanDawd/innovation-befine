import { describe, it, expect } from "vitest";
import { earningsPeriods, type EarningsDay } from "@/lib/payroll/my-earnings-days";
import { isoWeekStartOf } from "@/lib/dates";

// Bogota is UTC-5: 2026-10-24T13:00Z is 08:00 on Saturday 24 Oct in Bogota.
const day = (id: string, openedAt: string, closed = true): EarningsDay => ({
  id,
  openedAt,
  closedAt: closed ? openedAt : null,
});

describe("isoWeekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(isoWeekStartOf("2026-10-24")).toBe("2026-10-19"); // Saturday
    expect(isoWeekStartOf("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(isoWeekStartOf("2026-10-19")).toBe("2026-10-19"); // Monday
  });

  it("crosses month boundaries", () => {
    expect(isoWeekStartOf("2026-11-01")).toBe("2026-10-26");
  });
});

describe("earningsPeriods", () => {
  const today = "2026-10-24";

  it("counts the open business day in today, week and month", () => {
    const open = day("open", "2026-10-24T13:00:00Z", false);
    const p = earningsPeriods([open], new Set(), today);
    expect(p.today).toEqual(["open"]);
    expect(p.week).toEqual(["open"]);
    expect(p.month).toEqual(["open"]);
    expect(p.openDayId).toBe("open");
  });

  it("keeps an open day that crossed midnight in today", () => {
    // Opened 20:00 Bogota on the 23rd, still open on the 24th
    const open = day("open", "2026-10-24T01:00:00Z", false);
    expect(earningsPeriods([open], new Set(), today).today).toEqual(["open"]);
  });

  it("files a closed day under its Bogota date, not its UTC date", () => {
    // 20:00 Bogota on the 23rd is already the 24th in UTC
    const lateYesterday = day("late", "2026-10-24T01:00:00Z");
    const p = earningsPeriods([lateYesterday], new Set(), today);
    expect(p.today).toEqual([]);
    expect(p.week).toEqual(["late"]);
  });

  it("splits week and month by Bogota date", () => {
    const days = [
      day("lastMonth", "2026-09-30T14:00:00Z"),
      day("lastWeek", "2026-10-18T14:00:00Z"),
      day("monday", "2026-10-19T14:00:00Z"),
    ];
    const p = earningsPeriods(days, new Set(), today);
    expect(p.week).toEqual(["monday"]);
    expect(p.month).toEqual(["lastWeek", "monday"]);
    expect(p.openDayId).toBeNull();
  });

  it("leaves out days already paid", () => {
    const days = [day("paid", "2026-10-24T13:00:00Z"), day("unpaid", "2026-10-24T18:00:00Z")];
    expect(earningsPeriods(days, new Set(["paid"]), today).today).toEqual(["unpaid"]);
  });
});
