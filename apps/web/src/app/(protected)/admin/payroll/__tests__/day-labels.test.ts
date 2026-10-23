import { describe, it, expect } from "vitest";
import { byOpenedAt, lastDayOn } from "../day-labels";

// Pay-through-today with a closed-and-reopened day (found by the payroll E2E).

const days = [
  { id: "d3", date: "2026-10-23", openedAt: "2026-10-23T22:37:00.000Z" },
  { id: "d1", date: "2026-10-22", openedAt: "2026-10-22T13:00:00.000Z" },
  { id: "d2", date: "2026-10-23", openedAt: "2026-10-23T22:20:00.000Z" },
  { id: "d4", date: "2026-10-23", openedAt: "2026-10-23T22:39:00.000Z" },
];

describe("byOpenedAt", () => {
  it("orders days chronologically, including several on one date", () => {
    expect(byOpenedAt(days).map((d) => d.id)).toEqual(["d1", "d2", "d3", "d4"]);
  });

  it("doesn't mutate the input", () => {
    const copy = [...days];
    byOpenedAt(days);
    expect(days).toEqual(copy);
  });
});

describe("lastDayOn", () => {
  it("returns the latest session of the date, not the first", () => {
    expect(lastDayOn(days, "2026-10-23")?.id).toBe("d4");
  });

  it("returns the only day when the date has one", () => {
    expect(lastDayOn(days, "2026-10-22")?.id).toBe("d1");
  });

  it("returns undefined when there is no day on the date", () => {
    expect(lastDayOn(days, "2026-10-24")).toBeUndefined();
  });
});
