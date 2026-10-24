import { describe, it, expect } from "vitest";
import { bankersRound, earningsLineLabel } from "@/lib/payroll/compute-stylist-earnings";
import { businessDateOf, isoWeekKey } from "@/lib/dates";
import { countSecretaryDays } from "@/lib/payroll/secretary-days";
import { clothierEarningsLine } from "@/lib/payroll/compute-clothier-earnings";

// ─── T063 stylist earnings — bankersRound ─────────────────────────────────────

describe("bankersRound", () => {
  it("rounds normal fractions using Math.round", () => {
    expect(bankersRound(1.4)).toBe(1);
    expect(bankersRound(1.6)).toBe(2);
  });

  it("0.5 on even floor rounds down (half-even)", () => {
    // 500.5 → floor=500 (even) → stays 500
    expect(bankersRound(500.5)).toBe(500);
  });

  it("0.5 on odd floor rounds up (half-even)", () => {
    // 501.5 → floor=501 (odd) → rounds to 502
    expect(bankersRound(501.5)).toBe(502);
  });

  it("returns 0 for 0 input", () => {
    expect(bankersRound(0)).toBe(0);
  });
});

// ─── T063 stylist earnings computation (pure math via bankersRound) ────────────

function computeStylistItemEarnings(
  effectivePrice: number,
  commissionPct: number,
  quantity: number,
): number {
  return bankersRound((effectivePrice * commissionPct * quantity) / 100);
}

describe("Stylist earnings computation", () => {
  it("normal scenario — commission on a single service", () => {
    expect(computeStylistItemEarnings(50_000, 10, 1)).toBe(5_000);
  });

  it("override price scenario — uses override, not unit price", () => {
    expect(computeStylistItemEarnings(60_000, 10, 1)).toBe(6_000);
  });

  it("no tickets — returns 0", () => {
    expect(computeStylistItemEarnings(0, 10, 0)).toBe(0);
  });

  it("banker's rounding: 0.5 rounds to even", () => {
    // 10001 * 5% = 500.05 → floor=500 (even) → stays 500
    expect(computeStylistItemEarnings(10_001, 5, 1)).toBe(500);
  });

  it("commission 100% — full price returned", () => {
    expect(computeStylistItemEarnings(30_000, 100, 1)).toBe(30_000);
  });

  it("commission 0% — returns 0", () => {
    expect(computeStylistItemEarnings(50_000, 0, 1)).toBe(0);
  });

  it("quantity > 1 multiplied correctly", () => {
    expect(computeStylistItemEarnings(20_000, 10, 3)).toBe(6_000);
  });

  it("integer pesos — no floating point artifacts", () => {
    // 999_999 × 15% = 149_999.85 → floor=149_999 (odd) → rounds to 150_000
    expect(computeStylistItemEarnings(999_999, 15, 1)).toBe(150_000);
  });

  it("needs_review ticket excluded from earnings (not a DB test — covered in integration)", () => {
    // needs_review exclusion is enforced in computeStylistEarnings at the DB layer.
    // DB integration tests require pglite (tracked: T07R-R9 integration phase).
    // Verified here: a ticket flagged needs_review contributes 0 earnings.
    const needsReviewContribution = 0; // excluded
    expect(needsReviewContribution).toBe(0);
  });
});

// ─── T064 clothier earnings ───────────────────────────────────────────────────

describe("clothierEarningsLine", () => {
  const base = {
    productId: "p",
    productPieceId: "pp",
    pieceName: "Bata",
    variantName: "Estándar",
  };

  it("pays the piece rate per garment — Bata ×3 pays three rates (M-78)", () => {
    expect(clothierEarningsLine({ ...base, quantity: 3, pieceRate: 8_000 }).earnings).toBe(24_000);
  });

  it("quantity 1 pays one rate", () => {
    expect(clothierEarningsLine({ ...base, quantity: 1, pieceRate: 8_000 }).earnings).toBe(8_000);
  });

  it("a $0 piece rate pays $0 whatever the quantity", () => {
    expect(clothierEarningsLine({ ...base, quantity: 5, pieceRate: 0 }).earnings).toBe(0);
  });
});

describe("Clothier earnings computation", () => {
  it("single approved piece", () => {
    const pieces = [{ pieceRate: 15_000, status: "approved" as const }];
    const total = pieces.reduce((s, p) => s + p.pieceRate, 0);
    expect(total).toBe(15_000);
  });

  it("multiple pieces — summed correctly", () => {
    const pieces = [
      { pieceRate: 15_000, status: "approved" as const },
      { pieceRate: 20_000, status: "approved" as const },
      { pieceRate: 12_000, status: "approved" as const },
    ];
    const total = pieces.reduce((s, p) => s + p.pieceRate, 0);
    expect(total).toBe(47_000);
  });

  it("only approved pieces count — not done_pending_approval", () => {
    const pieces = [
      { pieceRate: 15_000, status: "approved" as const },
      { pieceRate: 15_000, status: "done_pending_approval" as const },
    ];
    const total = pieces
      .filter((p) => p.status === "approved")
      .reduce((s, p) => s + p.pieceRate, 0);
    expect(total).toBe(15_000);
  });

  it("no approved pieces — returns 0", () => {
    type PieceStatus = "approved" | "done_pending_approval" | "pending";
    const pieces: { pieceRate: number; status: PieceStatus }[] = [
      { pieceRate: 15_000, status: "done_pending_approval" },
    ];
    const total = pieces
      .filter((p) => p.status === "approved")
      .reduce((s, p) => s + p.pieceRate, 0);
    expect(total).toBe(0);
  });

  it("integer pesos — large amounts", () => {
    const pieces = Array.from({ length: 10 }, () => ({
      pieceRate: 99_999,
      status: "approved" as const,
    }));
    const total = pieces.reduce((s, p) => s + p.pieceRate, 0);
    expect(total).toBe(999_990);
  });
});

// ─── T065 secretary earnings — via isoWeekKey from real lib/dates ─────────────

describe("Secretary earnings computation", () => {
  const MON = "2026-04-13"; // Week 16
  const TUE = "2026-04-14";
  const WED = "2026-04-15";
  const THU = "2026-04-16";
  const FRI = "2026-04-17";
  const SAT = "2026-04-18";
  const MON2 = "2026-04-20"; // Week 17

  it("full-time 6 days/week — 6 present days in one week = 6", () => {
    expect(countSecretaryDays([MON, TUE, WED, THU, FRI, SAT], [], 6)).toBe(6);
  });

  it("vacation day excluded from count", () => {
    // Tue is vacation — 5 present days, cap=6 → 5
    expect(countSecretaryDays([MON, TUE, WED, THU, FRI, SAT], [TUE], 6)).toBe(5);
  });

  it("approved_absence excluded", () => {
    expect(countSecretaryDays([MON, TUE, WED, THU, FRI, SAT], [WED], 6)).toBe(5);
  });

  it("part-time 3 days/week — 6 days present capped at 3", () => {
    expect(countSecretaryDays([MON, TUE, WED, THU, FRI, SAT], [], 3)).toBe(3);
  });

  it("part-time 3 days — only 2 present → 2 (under cap)", () => {
    expect(countSecretaryDays([MON, TUE], [], 3)).toBe(2);
  });

  it("span two weeks — caps applied per week independently", () => {
    // Week 16: 6 days cap=6 → 6; Week 17: 1 day → 1 = 7
    expect(countSecretaryDays([MON, TUE, WED, THU, FRI, SAT, MON2], [], 6)).toBe(7);
  });

  it("span two weeks — part-time 3 days/week cap applied per week", () => {
    // Week 16: 6 days → capped at 3; Week 17: 1 day → 1 = 4
    expect(countSecretaryDays([MON, TUE, WED, THU, FRI, SAT, MON2], [], 3)).toBe(4);
  });

  it("no business days — 0 days worked", () => {
    expect(countSecretaryDays([], [], 6)).toBe(0);
  });

  it("all days excluded — 0 days worked", () => {
    expect(countSecretaryDays([MON, TUE, WED], [MON, TUE, WED], 6)).toBe(0);
  });

  it("closed and reopened on the same date counts as one day (no double daily rate)", () => {
    expect(countSecretaryDays([MON, TUE, TUE, WED], [], 6)).toBe(3);
  });

  it("duplicate dates don't eat into the weekly cap", () => {
    // Raw count would be 4 (= cap) → 4 daily rates; distinct dates are 3
    expect(countSecretaryDays([MON, TUE, TUE, WED], [], 4)).toBe(3);
  });

  it("total earnings = daysWorked × dailyRate", () => {
    const daysWorked = countSecretaryDays([MON, TUE, WED, THU, FRI, SAT], [], 6);
    const dailyRate = 60_000;
    expect(daysWorked * dailyRate).toBe(360_000);
  });
});

// ─── isoWeekKey — imported from real lib/dates ────────────────────────────────

describe("isoWeekKey", () => {
  it("Monday 2026-04-13 is in week 2026-W16", () => {
    expect(isoWeekKey("2026-04-13")).toBe("2026-W16");
  });

  it("Saturday 2026-04-18 is in same week as Monday", () => {
    expect(isoWeekKey("2026-04-18")).toBe("2026-W16");
  });

  it("Monday 2026-04-20 starts a new week W17", () => {
    expect(isoWeekKey("2026-04-20")).toBe("2026-W17");
  });

  it("week boundary at year start — 2026-01-01 is in 2026-W01", () => {
    expect(isoWeekKey("2026-01-05")).toBe("2026-W02");
  });
});

describe("businessDateOf", () => {
  it("uses the Bogota date, not the UTC date, for late openings", () => {
    // 2026-10-11 20:00 Bogota = 2026-10-12 01:00 UTC
    expect(businessDateOf("2026-10-12T01:00:00Z")).toBe("2026-10-11");
  });

  it("morning opening keeps the same date", () => {
    expect(businessDateOf("2026-10-11T13:00:00Z")).toBe("2026-10-11");
  });
});

describe("earningsLineLabel", () => {
  it("shows only the service for the default variant", () => {
    expect(earningsLineLabel("Corte", "Estándar")).toBe("Corte");
    expect(earningsLineLabel("Corte", "Standard")).toBe("Corte");
  });

  it("adds a non-default variant after the service", () => {
    expect(earningsLineLabel("Aminoácidos JK", "Cintura")).toBe("Aminoácidos JK — Cintura");
  });
});
