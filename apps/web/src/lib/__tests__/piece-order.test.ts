import { describe, it, expect } from "vitest";
import { spreadForClaimer } from "../piece-order";

// M-58 — claimable pieces are spread per clothier so they don't collide.

const pieces = Array.from({ length: 12 }, (_, i) => ({
  id: `piece-${i}`,
  productDate: i < 2 ? "2026-10-21" : "2026-10-23",
}));

describe("spreadForClaimer", () => {
  it("keeps older days first for every clothier", () => {
    for (const emp of ["emp-a", "emp-b", "emp-c"]) {
      const order = spreadForClaimer(pieces, emp);
      expect(order.slice(0, 2).every((p) => p.productDate === "2026-10-21")).toBe(true);
    }
  });

  it("gives different clothiers a different top piece for the same day", () => {
    const today = pieces.filter((p) => p.productDate === "2026-10-23");
    const tops = new Set(
      ["emp-a", "emp-b", "emp-c", "emp-d"].map((emp) => spreadForClaimer(today, emp)[0]!.id),
    );
    expect(tops.size).toBeGreaterThan(1);
  });

  it("is stable for the same clothier across refetches", () => {
    expect(spreadForClaimer(pieces, "emp-a")).toEqual(
      spreadForClaimer([...pieces].reverse(), "emp-a"),
    );
  });

  it("returns a permutation without mutating the input", () => {
    const copy = [...pieces];
    const order = spreadForClaimer(pieces, "emp-a");
    expect(pieces).toEqual(copy);
    expect([...order].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...pieces].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });
});
