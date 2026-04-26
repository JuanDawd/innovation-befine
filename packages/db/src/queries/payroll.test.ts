import { describe, expect, it, vi } from "vitest";
import { getUnpaidPastBusinessDays } from "./payroll";
import type { Database } from "../index";

type Row = { id: string; openedAt: Date };
type Settled = { businessDayId: string };

function mockDb(closed: Row[], settled: Settled[]) {
  // First call: closed business days. Second call: settled period rows.
  let call = 0;
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => Promise.resolve(closed),
      }),
    }),
  }));
  const select2 = vi.fn(() => ({
    from: () => ({
      where: () => Promise.resolve(settled),
    }),
  }));

  return {
    select: vi.fn(() => {
      call += 1;
      return call === 1 ? select() : select2();
    }),
  } as unknown as Database;
}

describe("getUnpaidPastBusinessDays", () => {
  it("returns closed days that are not in payout_period_days", async () => {
    const closed: Row[] = [
      { id: "d1", openedAt: new Date("2026-04-21T10:00:00Z") },
      { id: "d2", openedAt: new Date("2026-04-22T10:00:00Z") },
      { id: "d3", openedAt: new Date("2026-04-23T10:00:00Z") },
    ];
    const settled: Settled[] = [{ businessDayId: "d2" }];

    const result = await getUnpaidPastBusinessDays(mockDb(closed, settled), "emp-1");

    expect(result).toEqual([
      { businessDayId: "d1", date: "2026-04-21" },
      { businessDayId: "d3", date: "2026-04-23" },
    ]);
  });

  it("returns an empty array when there are no closed days", async () => {
    const result = await getUnpaidPastBusinessDays(mockDb([], []), "emp-1");
    expect(result).toEqual([]);
  });

  it("returns every closed day when none are settled", async () => {
    const closed: Row[] = [
      { id: "d1", openedAt: new Date("2026-04-21T10:00:00Z") },
      { id: "d2", openedAt: new Date("2026-04-22T10:00:00Z") },
    ];
    const result = await getUnpaidPastBusinessDays(mockDb(closed, []), "emp-1");
    expect(result.map((r) => r.businessDayId)).toEqual(["d1", "d2"]);
  });
});
