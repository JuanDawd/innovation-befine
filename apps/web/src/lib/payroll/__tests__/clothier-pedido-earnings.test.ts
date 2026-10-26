import { describe, it, expect } from "vitest";
import {
  payoutReviewIds,
  pedidoEarningsLines,
  type ClothierReviewRow,
} from "../compute-clothier-earnings";
import { closingBlockMessage } from "../clothier-closing-gate";

// T126 — clothier pay = approved units × assignment rate, explainable line by line.

const DAY1 = "day-1";
const DAY2 = "day-2";

const row = (over: Partial<ClothierReviewRow>): ClothierReviewRow => ({
  reviewId: "rv-1",
  businessDayId: DAY1,
  assignmentId: "a-1",
  pedidoNumber: 12,
  pieceName: "Bata",
  variantName: "Manga corta",
  sizeLabel: "M",
  pieceRate: 12_500,
  rateReason: null,
  approved: 0,
  scrapped: 0,
  scrapPaid: false,
  ...over,
});

const total = (rows: ClothierReviewRow[]) =>
  pedidoEarningsLines(rows).reduce((n, l) => n + l.earnings, 0);

describe("pedidoEarningsLines", () => {
  it("pays approved units at the assignment rate, one line per day and assignment", () => {
    const lines = pedidoEarningsLines([
      row({ reviewId: "rv-1", approved: 4 }),
      row({ reviewId: "rv-2", approved: 2 }), // same day, same assignment → same line
      row({ reviewId: "rv-3", assignmentId: "a-2", sizeLabel: "L", approved: 3 }),
    ]);
    expect(lines).toEqual([
      expect.objectContaining({
        businessDayId: DAY1,
        pedidoNumber: 12,
        sizeLabel: "L",
        quantity: 3,
        pieceRate: 12_500,
        earnings: 37_500,
        kind: "approved",
        source: "pedido",
        unitReviewIds: ["rv-3"],
      }),
      expect.objectContaining({
        sizeLabel: "M",
        quantity: 6,
        earnings: 75_000,
        unitReviewIds: ["rv-1", "rv-2"],
      }),
    ]);
  });

  it("pays a correction once: returned units earn nothing until re-approved", () => {
    // Day 1: 5 reported → 3 approved, 2 returned. Day 2: the 2 redone are approved.
    const rows = [
      row({ reviewId: "rv-1", approved: 3 }),
      row({ reviewId: "rv-2", businessDayId: DAY2, approved: 2 }),
    ];
    expect(total(rows)).toBe(5 * 12_500);
    expect(pedidoEarningsLines(rows).map((l) => [l.businessDayId, l.quantity])).toEqual([
      [DAY1, 3],
      [DAY2, 2],
    ]);
  });

  it("uses each assignment's own rate (admin override)", () => {
    const lines = pedidoEarningsLines([
      row({ assignmentId: "a-1", approved: 2 }),
      row({
        reviewId: "rv-2",
        assignmentId: "a-2",
        pieceRate: 15_000,
        rateReason: "entrega urgente",
        approved: 2,
      }),
    ]);
    expect(lines.map((l) => [l.pieceRate, l.earnings, l.rateReason])).toEqual([
      [12_500, 25_000, null],
      [15_000, 30_000, "entrega urgente"],
    ]);
  });

  it("pays scrapped units only when the review was marked paid", () => {
    const off = [row({ approved: 3, scrapped: 1, scrapPaid: false })];
    expect(total(off)).toBe(3 * 12_500);
    const on = [row({ approved: 3, scrapped: 1, scrapPaid: true })];
    const lines = pedidoEarningsLines(on);
    expect(total(on)).toBe(4 * 12_500);
    expect(lines.map((l) => [l.kind, l.quantity])).toEqual([
      ["approved", 3],
      ["scrapped", 1],
    ]);
  });

  it("keeps pay for units moved out of the pedido by a restructure", () => {
    // Approved units later moved to stock: the review row is unchanged, so pay is too.
    const rows = [row({ approved: 10 })];
    expect(total(rows)).toBe(125_000);
  });

  it("returns nothing for reviews that only returned units", () => {
    expect(pedidoEarningsLines([row({ approved: 0, scrapped: 0 })])).toEqual([]);
  });

  it("stays in whole pesos", () => {
    const t = total([row({ pieceRate: 12_345, approved: 7 })]);
    expect(t).toBe(86_415);
    expect(Number.isInteger(t)).toBe(true);
  });
});

describe("closingBlockMessage", () => {
  it("explains why Liquidar is blocked", () => {
    expect(closingBlockMessage("Luz", [])).toBeNull();
    expect(
      closingBlockMessage("Luz", [{ businessDayId: "d", date: "2026-10-24", state: "missing" }]),
    ).toBe(
      "Luz no ha cerrado su jornada del 24 de oct. Apruébalo en Producción → Cierres antes de liquidar.",
    );
    expect(
      closingBlockMessage("Luz", [
        { businessDayId: "d1", date: "2026-10-23", state: "missing" },
        { businessDayId: "d2", date: "2026-10-24", state: "pending" },
      ]),
    ).toBe(
      "Luz no ha cerrado su jornada del 23 de oct y tiene el cierre del 24 de oct sin aprobar. Apruébalo en Producción → Cierres antes de liquidar.",
    );
    expect(
      closingBlockMessage("Luz", [{ businessDayId: "d", date: "2026-10-24", state: "pending" }]),
    ).toBe(
      "Luz tiene el cierre del 24 de oct sin aprobar. Apruébalo en Producción → Cierres antes de liquidar.",
    );
  });
});

describe("payoutReviewIds", () => {
  it("links a review with approved units and paid scraps once", () => {
    const lines = pedidoEarningsLines([
      row({ reviewId: "rv-1", approved: 3, scrapped: 1, scrapPaid: true }),
      row({ reviewId: "rv-2", assignmentId: "a-2", approved: 2 }),
    ]);
    expect(lines.flatMap((l) => l.unitReviewIds).sort()).toEqual(["rv-1", "rv-1", "rv-2"]);
    expect(payoutReviewIds(lines).sort()).toEqual(["rv-1", "rv-2"]);
  });
});
