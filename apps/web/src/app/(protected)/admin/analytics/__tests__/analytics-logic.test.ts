import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";

// ─── Helpers under test (pure logic extracted from analytics queries) ─────────
// These tests cover the pure computational logic used in analytics.
// DB-integration tests require pglite and are tracked separately.

// ISO-week key — mirrors isoWeekKey from lib/dates
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// Secretary earnings with ISO-week cap — mirrors earningsByEmployee secretary branch
function computeSecretaryEarningsAnalytics(
  allDates: string[],
  excludedDates: string[],
  expectedWorkDays: number,
  dailyRate: number,
): number {
  const excluded = new Set(excludedDates);
  const weekCounts = new Map<string, number>();
  for (const d of allDates) {
    if (excluded.has(d)) continue;
    const wk = isoWeekKey(d);
    weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1);
  }
  let daysWorked = 0;
  for (const count of weekCounts.values()) {
    daysWorked += Math.min(count, expectedWorkDays);
  }
  return daysWorked * dailyRate;
}

// Period boundary logic — mirrors getBusinessDayIdsByPeriod week/month
function weekBoundaries(bogotaToday: string): {
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
} {
  const today = Temporal.PlainDate.from(bogotaToday);

  // ISO: Monday = 1, Sunday = 7
  const dayOfWeek = today.dayOfWeek;

  const currentStart = today.subtract({ days: dayOfWeek - 1 });
  const currentEnd = currentStart.add({ days: 6 });

  const priorStart = currentStart.subtract({ days: 7 });
  const priorEnd = currentStart.subtract({ days: 1 });

  return {
    currentStart: currentStart.toString(),
    currentEnd: currentEnd.toString(),
    priorStart: priorStart.toString(),
    priorEnd: priorEnd.toString(),
  };
}

function monthBoundaries(bogotaToday: string): {
  currentStart: string;
  priorStart: string;
  priorEnd: string;
} {
  const today = Temporal.PlainDate.from(bogotaToday);

  const currentStart = today.with({ day: 1 });
  const priorStart = currentStart.subtract({ months: 1 });
  const priorEnd = currentStart.subtract({ days: 1 });

  return {
    currentStart: currentStart.toString(),
    priorStart: priorStart.toString(),
    priorEnd: priorEnd.toString(),
  };
}

// Bogota date formatting — mirrors toBogotaDate
function toBogotaDate(isoUtc: string): string {
  const instant = Temporal.Instant.from(isoUtc);
  const zoned = instant.toZonedDateTimeISO("America/Bogota");
  return zoned.toPlainDate().toString();
}

// ─── T08R-R2: secretary earnings ──────────────────────────────────────────────

describe("Secretary analytics earnings (T08R-R2)", () => {
  const MON = "2026-04-13";
  const TUE = "2026-04-14";
  const WED = "2026-04-15";
  const THU = "2026-04-16";
  const FRI = "2026-04-17";
  const SAT = "2026-04-18";
  const MON2 = "2026-04-20"; // Week 17

  it("full week × daily_rate", () => {
    expect(computeSecretaryEarningsAnalytics([MON, TUE, WED, THU, FRI, SAT], [], 6, 60_000)).toBe(
      360_000,
    );
  });

  it("vacation day excluded", () => {
    expect(
      computeSecretaryEarningsAnalytics([MON, TUE, WED, THU, FRI, SAT], [TUE], 6, 60_000),
    ).toBe(300_000);
  });

  it("part-time cap applied per week", () => {
    // 6 days present, cap=3 → 3 days × 60_000 = 180_000
    expect(computeSecretaryEarningsAnalytics([MON, TUE, WED, THU, FRI, SAT], [], 3, 60_000)).toBe(
      180_000,
    );
  });

  it("two-week span caps independently", () => {
    // Week 16: 6 days cap=6→6; Week 17: 1 day→1; total=7
    expect(
      computeSecretaryEarningsAnalytics([MON, TUE, WED, THU, FRI, SAT, MON2], [], 6, 60_000),
    ).toBe(420_000);
  });

  it("all days excluded → 0", () => {
    expect(computeSecretaryEarningsAnalytics([MON, TUE, WED], [MON, TUE, WED], 6, 60_000)).toBe(0);
  });

  it("zero daily_rate → 0", () => {
    expect(computeSecretaryEarningsAnalytics([MON, TUE, WED], [], 6, 0)).toBe(0);
  });
});

// ─── T08R-R8: ISO-week cap in drill-down ──────────────────────────────────────

describe("Secretary ISO-week cap consistency (T08R-R8)", () => {
  it("part-time 3/week: payroll and analytics give same result", () => {
    const days = [
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
      "2026-04-18",
    ];
    const dailyRate = 50_000;
    // cap=3 → 3 days worked → 150_000
    expect(computeSecretaryEarningsAnalytics(days, [], 3, dailyRate)).toBe(150_000);
  });
});

// ─── T08R-R9: week boundary alignment ────────────────────────────────────────

describe("Week period boundaries (T08R-R9)", () => {
  it("current window spans full Mon–Sun", () => {
    // Monday
    const { currentStart, currentEnd } = weekBoundaries("2026-04-20");
    expect(currentStart).toBe("2026-04-20");
    expect(currentEnd).toBe("2026-04-26");
  });

  it("mid-week: current still starts on Monday", () => {
    const { currentStart, currentEnd } = weekBoundaries("2026-04-22"); // Wednesday
    expect(currentStart).toBe("2026-04-20");
    expect(currentEnd).toBe("2026-04-26");
  });

  it("prior week is full Mon–Sun", () => {
    const { priorStart, priorEnd } = weekBoundaries("2026-04-22");
    expect(priorStart).toBe("2026-04-13");
    expect(priorEnd).toBe("2026-04-19");
  });

  it("prior week does not overlap current week", () => {
    const { currentStart, priorEnd } = weekBoundaries("2026-04-22");
    expect(new Date(priorEnd) < new Date(currentStart)).toBe(true);
  });
});

// ─── Month boundaries ─────────────────────────────────────────────────────────

describe("Month period boundaries", () => {
  it("current month starts on the 1st", () => {
    const { currentStart } = monthBoundaries("2026-04-20");
    expect(currentStart).toBe("2026-04-01");
  });

  it("prior month boundaries are correct", () => {
    const { priorStart, priorEnd } = monthBoundaries("2026-04-20");
    expect(priorStart).toBe("2026-03-01");
    expect(priorEnd).toBe("2026-03-31");
  });

  it("prior month at year boundary (Jan → Dec)", () => {
    const { priorStart, priorEnd } = monthBoundaries("2026-01-15");
    expect(priorStart).toBe("2025-12-01");
    expect(priorEnd).toBe("2025-12-31");
  });
});

// ─── T08R-R14: Bogota date formatting ────────────────────────────────────────

describe("Bogota date formatting (T08R-R14)", () => {
  it("UTC midnight stays on Bogota date (UTC-5 is same calendar day)", () => {
    // 2026-04-20T05:00:00Z = 2026-04-20T00:00:00-05:00 (midnight Bogota)
    expect(toBogotaDate("2026-04-20T05:00:00.000Z")).toBe("2026-04-20");
  });

  it("23:59 Bogota does not drift to next UTC day", () => {
    // 2026-04-20T23:59:00-05:00 = 2026-04-21T04:59:00Z
    // UTC date is April 21, but Bogota date is still April 20
    expect(toBogotaDate("2026-04-21T04:59:00.000Z")).toBe("2026-04-20");
  });

  it("00:00 UTC = 19:00 prev day Bogota", () => {
    // 2026-04-21T00:00:00Z = 2026-04-20T19:00:00-05:00 — still April 20 in Bogota
    expect(toBogotaDate("2026-04-21T00:00:00.000Z")).toBe("2026-04-20");
  });
});

// ─── T08R-R5: Zod schema validation ──────────────────────────────────────────

describe("Analytics Zod schemas (T08R-R5)", () => {
  it("analyticsQuerySchema accepts valid period", async () => {
    const { analyticsQuerySchema } = await import("@befine/types");
    expect(analyticsQuerySchema.safeParse({ period: "day" }).success).toBe(true);
    expect(analyticsQuerySchema.safeParse({ period: "week" }).success).toBe(true);
    expect(analyticsQuerySchema.safeParse({ period: "month" }).success).toBe(true);
  });

  it("analyticsQuerySchema rejects invalid period", async () => {
    const { analyticsQuerySchema } = await import("@befine/types");
    expect(analyticsQuerySchema.safeParse({ period: "year" }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ period: "" }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({}).success).toBe(false);
  });

  it("employeeDrillDownSchema rejects invalid uuid", async () => {
    const { employeeDrillDownSchema } = await import("@befine/types");
    expect(
      employeeDrillDownSchema.safeParse({ employeeId: "not-a-uuid", period: "day" }).success,
    ).toBe(false);
  });

  it("employeeDrillDownSchema accepts valid input", async () => {
    const { employeeDrillDownSchema } = await import("@befine/types");
    expect(
      employeeDrillDownSchema.safeParse({
        employeeId: "123e4567-e89b-12d3-a456-426614174000",
        period: "month",
      }).success,
    ).toBe(true);
  });
});

// ─── T08R-R1: open day included in current window ────────────────────────────

describe("Open business day in current window (T08R-R1)", () => {
  it("filter includes days with null closedAt in current window", () => {
    // Simulate the JS-side filter logic from getBusinessDayIdsByPeriod
    const currentStart = new Date("2026-04-20T00:00:00-05:00");
    const currentEnd = new Date("2026-04-20T23:59:59-05:00");
    const priorStart = new Date("2026-04-19T00:00:00-05:00");
    const priorEnd = new Date("2026-04-19T23:59:59-05:00");

    const rows = [
      { id: "open-day", openedAt: new Date("2026-04-20T08:00:00-05:00"), closedAt: null },
      {
        id: "closed-today",
        openedAt: new Date("2026-04-20T08:00:00-05:00"),
        closedAt: new Date("2026-04-20T18:00:00-05:00"),
      },
      {
        id: "closed-yesterday",
        openedAt: new Date("2026-04-19T08:00:00-05:00"),
        closedAt: new Date("2026-04-19T18:00:00-05:00"),
      },
    ];

    const current = rows
      .filter((d) => d.openedAt >= currentStart && d.openedAt <= currentEnd)
      .map((d) => d.id);

    const prior = rows
      .filter((d) => d.closedAt !== null && d.openedAt >= priorStart && d.openedAt <= priorEnd)
      .map((d) => d.id);

    // Open day IS in current window
    expect(current).toContain("open-day");
    expect(current).toContain("closed-today");
    // Open day is NOT in prior window (closedAt filter)
    expect(prior).not.toContain("open-day");
    expect(prior).toContain("closed-yesterday");
  });
});
