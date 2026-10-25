import { describe, it, expect } from "vitest";
import { summarizeAssignment, summarizeCell, sumProgress } from "./pedido-progress";

const report = (quantity: number) => ({ quantity, kind: "report" as const });
const rework = (quantity: number) => ({ quantity, kind: "rework" as const });
const review = (approved: number, returned = 0, scrapped = 0) => ({ approved, returned, scrapped });

describe("summarizeAssignment", () => {
  it("starts with everything unstarted", () => {
    expect(summarizeAssignment({ quantity: 5, reports: [], reviews: [] })).toEqual({
      live: 5,
      reported: 0,
      rework: 0,
      approved: 0,
      returned: 0,
      scrapped: 0,
      pendingReview: 0,
      inRework: 0,
      unstarted: 5,
    });
  });

  it("tracks a partial approval, a return, its rework and a scrap", () => {
    // 10 assigned → reports 6 → 3 approved, 2 returned, 1 scrapped
    // → 2 reworked → 2 approved
    const p = summarizeAssignment({
      quantity: 10,
      reports: [report(4), report(2), rework(2)],
      reviews: [review(3, 2, 1), review(2)],
    });
    expect(p).toMatchObject({
      live: 9,
      reported: 6,
      rework: 2,
      approved: 5,
      returned: 2,
      scrapped: 1,
      pendingReview: 0,
      inRework: 0,
      unstarted: 4,
    });
  });

  it("counts returned units as in rework until they are re-reported", () => {
    const p = summarizeAssignment({ quantity: 3, reports: [report(3)], reviews: [review(1, 2)] });
    expect(p.inRework).toBe(2);
    expect(p.pendingReview).toBe(0);
  });
});

describe("summarizeCell", () => {
  it("is all unassigned with no assignments", () => {
    const c = summarizeCell({ quantity: 12, assignments: [], deliveries: [] });
    expect(c).toMatchObject({ ordered: 12, assigned: 0, unassigned: 12, readyToDeliver: 0 });
  });

  it("splits a cell among clothiers and re-opens scrapped units", () => {
    const c = summarizeCell({
      quantity: 20,
      assignments: [
        { quantity: 12, reports: [report(12)], reviews: [review(10, 0, 2)] },
        { quantity: 8, reports: [report(3)], reviews: [] },
      ],
      deliveries: [{ quantity: 6 }],
    });
    expect(c).toEqual({
      ordered: 20,
      assigned: 18,
      unassigned: 2,
      reported: 15,
      approved: 10,
      returned: 0,
      scrapped: 2,
      pendingReview: 3,
      inRework: 0,
      delivered: 6,
      readyToDeliver: 4,
    });
  });

  it("never reports negative unassigned or ready units", () => {
    // Inconsistent input (the DB triggers prevent it) must not produce negatives.
    const c = summarizeCell({
      quantity: 2,
      assignments: [{ quantity: 5, reports: [], reviews: [] }],
      deliveries: [{ quantity: 1 }],
    });
    expect(c.unassigned).toBe(0);
    expect(c.readyToDeliver).toBe(0);
  });
});

describe("sumProgress", () => {
  it("adds cells field by field", () => {
    const a = summarizeCell({
      quantity: 5,
      assignments: [{ quantity: 5, reports: [report(5)], reviews: [review(5)] }],
      deliveries: [{ quantity: 5 }],
    });
    const b = summarizeCell({ quantity: 3, assignments: [], deliveries: [] });
    expect(sumProgress([a, b])).toMatchObject({
      ordered: 8,
      assigned: 5,
      unassigned: 3,
      approved: 5,
      delivered: 5,
    });
    expect(sumProgress([]).ordered).toBe(0);
  });
});
