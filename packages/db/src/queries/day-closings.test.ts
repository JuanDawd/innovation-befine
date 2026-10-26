import { describe, it, expect } from "vitest";
import { planDayCount, type DayCountState } from "./day-closings";

const state = (over: Partial<DayCountState> = {}): DayCountState => ({
  reportedToday: 0,
  todayRows: [],
  inRework: 0,
  unstarted: 10,
  pendingReview: 0,
  ...over,
});

describe("planDayCount", () => {
  it("does nothing when the count matches", () => {
    expect(planDayCount(3, state({ reportedToday: 3 }))).toEqual({ ok: true, add: [], trim: [] });
    expect(planDayCount(0, state())).toEqual({ ok: true, add: [], trim: [] });
  });

  it("adds the missing units, rework first", () => {
    expect(planDayCount(5, state({ reportedToday: 1, inRework: 2, unstarted: 6 }))).toEqual({
      ok: true,
      add: [
        { kind: "rework", quantity: 2 },
        { kind: "report", quantity: 2 },
      ],
      trim: [],
    });
    expect(planDayCount(2, state({ inRework: 5 }))).toEqual({
      ok: true,
      add: [{ kind: "rework", quantity: 2 }],
      trim: [],
    });
  });

  it("refuses more than is left to make", () => {
    const r = planDayCount(5, state({ reportedToday: 1, inRework: 1, unstarted: 2 }));
    expect(r).toEqual({ ok: false, message: "Solo quedan 3 unidades por hacer en este trabajo." });
    expect(planDayCount(2, state({ unstarted: 1 }))).toEqual({
      ok: false,
      message: "Solo queda 1 unidad por hacer en este trabajo.",
    });
    expect(planDayCount(1, state({ unstarted: 0 }))).toEqual({
      ok: false,
      message: "Este trabajo no tiene unidades por hacer.",
    });
  });

  it("takes back today's unreviewed units, newest rows first", () => {
    const r = planDayCount(
      2,
      state({
        reportedToday: 6,
        pendingReview: 6,
        todayRows: [
          { id: "r1", quantity: 3, kind: "report" },
          { id: "r2", quantity: 1, kind: "rework" },
          { id: "r3", quantity: 2, kind: "report" },
        ],
      }),
    );
    expect(r).toEqual({
      ok: true,
      add: [],
      trim: [
        { id: "r3", quantity: 0 },
        { id: "r2", quantity: 0 },
        { id: "r1", quantity: 2 },
      ],
    });
  });

  it("cannot go below units already reviewed", () => {
    const r = planDayCount(
      1,
      state({
        reportedToday: 5,
        pendingReview: 2,
        todayRows: [{ id: "r1", quantity: 5, kind: "report" }],
      }),
    );
    expect(r).toEqual({
      ok: false,
      message: "Ya se revisaron unidades de hoy: no puede bajar de 3.",
    });
  });

  it("rejects negative or fractional targets", () => {
    expect(planDayCount(-1, state()).ok).toBe(false);
    expect(planDayCount(1.5, state()).ok).toBe(false);
  });
});
