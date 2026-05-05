import { describe, it, expect } from "vitest";

// ─── Pure-logic mirrors of getCraftablesDashboard internals ───────────────────

type Section = "today" | "wip";

type MockCraftable = {
  id: string;
  businessDayId: string;
  businessDayOpenedAt: Date;
  businessDayClosedAt: Date | null;
  createdAt: Date;
  source: "manual" | "large_order";
  autoApproved: boolean;
  notes: string | null;
  largeOrderId: string | null;
};

type PieceCounts = { total: number; approved: number };

function classifyCraftable(
  c: MockCraftable,
  counts: PieceCounts,
  todayId: string | null,
): Section | null {
  const isToday = c.businessDayId === todayId;
  const isPastDay = !isToday && c.businessDayClosedAt !== null;

  if (isPastDay && counts.total > 0 && counts.approved >= counts.total) return null; // fully approved
  if (isPastDay && counts.total === 0) return null; // no pieces
  if (!isToday && !isPastDay) return null; // past open day edge case

  return isToday ? "today" : "wip";
}

function progressPct(total: number, approved: number): number {
  return total > 0 ? Math.round((approved / total) * 100) : 0;
}

function sortRows(rows: Array<{ section: Section; businessDayOpenedAt: Date; createdAt: Date }>) {
  return [...rows].sort((a, b) => {
    if (a.section !== b.section) return a.section === "wip" ? -1 : 1;
    if (a.section === "wip")
      return a.businessDayOpenedAt.getTime() - b.businessDayOpenedAt.getTime();
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-05T12:00:00Z");
const YESTERDAY = new Date("2026-05-04T08:00:00Z");
const TWO_DAYS_AGO = new Date("2026-05-03T08:00:00Z");

function makeCraftable(
  overrides: Partial<MockCraftable> & { id: string; businessDayId: string },
): MockCraftable {
  return {
    businessDayOpenedAt: NOW,
    businessDayClosedAt: null,
    createdAt: NOW,
    source: "manual",
    autoApproved: false,
    notes: null,
    largeOrderId: null,
    ...overrides,
  };
}

// ─── Classification tests ─────────────────────────────────────────────────────

describe("classifyCraftable — section assignment", () => {
  const todayId = "today-day";

  it("craftable from open (today) business day → 'today'", () => {
    const c = makeCraftable({ id: "c1", businessDayId: todayId });
    expect(classifyCraftable(c, { total: 2, approved: 1 }, todayId)).toBe("today");
  });

  it("craftable from today with zero pieces → still 'today'", () => {
    const c = makeCraftable({ id: "c1", businessDayId: todayId });
    expect(classifyCraftable(c, { total: 0, approved: 0 }, todayId)).toBe("today");
  });

  it("craftable from past day with pending pieces → 'wip'", () => {
    const c = makeCraftable({
      id: "c2",
      businessDayId: "past-day",
      businessDayOpenedAt: YESTERDAY,
      businessDayClosedAt: new Date("2026-05-04T18:00:00Z"),
    });
    expect(classifyCraftable(c, { total: 3, approved: 1 }, todayId)).toBe("wip");
  });

  it("craftable from past day — all pieces approved → excluded (null)", () => {
    const c = makeCraftable({
      id: "c3",
      businessDayId: "past-day",
      businessDayOpenedAt: YESTERDAY,
      businessDayClosedAt: new Date("2026-05-04T18:00:00Z"),
    });
    expect(classifyCraftable(c, { total: 3, approved: 3 }, todayId)).toBeNull();
  });

  it("craftable from past day with zero pieces → excluded (null)", () => {
    const c = makeCraftable({
      id: "c4",
      businessDayId: "past-day",
      businessDayClosedAt: new Date("2026-05-04T18:00:00Z"),
    });
    expect(classifyCraftable(c, { total: 0, approved: 0 }, todayId)).toBeNull();
  });

  it("no open business day → today's craftables still classified as 'today'", () => {
    // todayId=null means no open day; craftable with that businessDayId won't match
    const c = makeCraftable({ id: "c5", businessDayId: "some-day", businessDayClosedAt: null });
    // closedAt is null but businessDayId !== todayId (null) → isPastDay is false, !isToday → null
    expect(classifyCraftable(c, { total: 1, approved: 0 }, null)).toBeNull();
  });
});

// ─── Progress percent ─────────────────────────────────────────────────────────

describe("progressPct", () => {
  it("0 total → 0% (no division by zero)", () => {
    expect(progressPct(0, 0)).toBe(0);
  });

  it("all approved → 100%", () => {
    expect(progressPct(4, 4)).toBe(100);
  });

  it("half approved → 50%", () => {
    expect(progressPct(4, 2)).toBe(50);
  });

  it("rounds correctly", () => {
    expect(progressPct(3, 1)).toBe(33);
    expect(progressPct(3, 2)).toBe(67);
  });
});

// ─── Sort order ───────────────────────────────────────────────────────────────

describe("sort: WIP first (oldest), then today (newest)", () => {
  it("WIP rows appear before today rows", () => {
    const rows = [
      { section: "today" as Section, businessDayOpenedAt: NOW, createdAt: NOW },
      { section: "wip" as Section, businessDayOpenedAt: YESTERDAY, createdAt: YESTERDAY },
    ];
    const sorted = sortRows(rows);
    expect(sorted[0].section).toBe("wip");
    expect(sorted[1].section).toBe("today");
  });

  it("WIP rows sorted oldest first", () => {
    const rows = [
      { section: "wip" as Section, businessDayOpenedAt: YESTERDAY, createdAt: YESTERDAY },
      { section: "wip" as Section, businessDayOpenedAt: TWO_DAYS_AGO, createdAt: TWO_DAYS_AGO },
    ];
    const sorted = sortRows(rows);
    expect(sorted[0].businessDayOpenedAt).toEqual(TWO_DAYS_AGO);
    expect(sorted[1].businessDayOpenedAt).toEqual(YESTERDAY);
  });

  it("today rows sorted newest first", () => {
    const t1 = new Date("2026-05-05T09:00:00Z");
    const t2 = new Date("2026-05-05T11:00:00Z");
    const rows = [
      { section: "today" as Section, businessDayOpenedAt: NOW, createdAt: t1 },
      { section: "today" as Section, businessDayOpenedAt: NOW, createdAt: t2 },
    ];
    const sorted = sortRows(rows);
    expect(sorted[0].createdAt).toEqual(t2);
    expect(sorted[1].createdAt).toEqual(t1);
  });
});
