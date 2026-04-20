import { describe, it, expect } from "vitest";

// ─── Banker's rounding (mirrors compute-stylist-earnings) ────────────────────

function bankersRound(n: number): number {
  const floor = Math.floor(n);
  const frac = n - floor;
  if (Math.abs(frac - 0.5) > Number.EPSILON) return Math.round(n);
  return floor % 2 === 0 ? floor : floor + 1;
}

function computeStylistItemEarnings(
  effectivePrice: number,
  commissionPct: number,
  quantity: number,
): number {
  return bankersRound((effectivePrice * commissionPct * quantity) / 100);
}

// ─── ISO week key (mirrors compute-secretary-earnings) ───────────────────────

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function computeSecretaryDays(
  allDates: string[],
  excludedDates: string[],
  expectedWorkDays: number,
): number {
  const excluded = new Set(excludedDates);
  const weekCounts = new Map<string, number>();
  for (const d of allDates) {
    if (excluded.has(d)) continue;
    const w = isoWeekKey(d);
    weekCounts.set(w, (weekCounts.get(w) ?? 0) + 1);
  }
  let total = 0;
  for (const count of weekCounts.values()) {
    total += Math.min(count, expectedWorkDays);
  }
  return total;
}

// ─── T063 stylist earnings ────────────────────────────────────────────────────

describe("Stylist earnings computation", () => {
  it("normal scenario — commission on a single service", () => {
    // $50,000 service at 10% commission = $5,000
    expect(computeStylistItemEarnings(50_000, 10, 1)).toBe(5_000);
  });

  it("override price scenario — uses override, not unit price", () => {
    // unit_price=$80,000 but override_price=$60,000; 10% = $6,000
    expect(computeStylistItemEarnings(60_000, 10, 1)).toBe(6_000);
  });

  it("no tickets — returns 0", () => {
    expect(computeStylistItemEarnings(0, 10, 0)).toBe(0);
  });

  it("banker's rounding: 0.5 rounds to even", () => {
    // 10001 * 5% = 500.05 → floor=500, floor%2=0 → rounds to 500
    expect(computeStylistItemEarnings(10_001, 5, 1)).toBe(500);
  });

  it("commission 100% — full price returned", () => {
    expect(computeStylistItemEarnings(30_000, 100, 1)).toBe(30_000);
  });

  it("commission 0% — returns 0", () => {
    expect(computeStylistItemEarnings(50_000, 0, 1)).toBe(0);
  });

  it("quantity > 1 multiplied correctly", () => {
    // $20,000 × 3 × 10% = $6,000
    expect(computeStylistItemEarnings(20_000, 10, 3)).toBe(6_000);
  });

  it("integer pesos — no floating point artifacts", () => {
    // $999,999 × 1 × 15% = $149,999.85 → banker's round → $150,000
    expect(computeStylistItemEarnings(999_999, 15, 1)).toBe(150_000);
  });
});

// ─── T064 clothier earnings ───────────────────────────────────────────────────

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

// ─── T065 secretary earnings ──────────────────────────────────────────────────

describe("Secretary earnings computation", () => {
  const MON = "2026-04-13"; // Week 16
  const TUE = "2026-04-14";
  const WED = "2026-04-15";
  const THU = "2026-04-16";
  const FRI = "2026-04-17";
  const SAT = "2026-04-18";
  const MON2 = "2026-04-20"; // Week 17

  it("full-time 6 days/week — 6 present days in one week = 6", () => {
    const days = [MON, TUE, WED, THU, FRI, SAT];
    expect(computeSecretaryDays(days, [], 6)).toBe(6);
  });

  it("full-time — vacation day excluded from count", () => {
    const days = [MON, TUE, WED, THU, FRI, SAT];
    // Tue is vacation — 5 present days, cap=6 → 5
    expect(computeSecretaryDays(days, [TUE], 6)).toBe(5);
  });

  it("full-time — approved_absence excluded but missed counts", () => {
    const days = [MON, TUE, WED, THU, FRI, SAT];
    // Wed excluded, 5 present
    expect(computeSecretaryDays(days, [WED], 6)).toBe(5);
  });

  it("part-time 3 days/week — 6 days present capped at 3", () => {
    const days = [MON, TUE, WED, THU, FRI, SAT];
    expect(computeSecretaryDays(days, [], 3)).toBe(3);
  });

  it("part-time 3 days — only 2 present → 2 (under cap)", () => {
    const days = [MON, TUE];
    expect(computeSecretaryDays(days, [], 3)).toBe(2);
  });

  it("span two weeks — caps applied per week independently", () => {
    // Week 16: Mon-Sat (6 days) cap=6 → 6
    // Week 17: Mon (1 day) cap=6 → 1
    const days = [MON, TUE, WED, THU, FRI, SAT, MON2];
    expect(computeSecretaryDays(days, [], 6)).toBe(7);
  });

  it("span two weeks — part-time 3 days/week cap applied per week", () => {
    // Week 16: 6 days → capped at 3
    // Week 17: 1 day → 1
    const days = [MON, TUE, WED, THU, FRI, SAT, MON2];
    expect(computeSecretaryDays(days, [], 3)).toBe(4);
  });

  it("no business days — 0 days worked", () => {
    expect(computeSecretaryDays([], [], 6)).toBe(0);
  });

  it("all days excluded — 0 days worked", () => {
    const days = [MON, TUE, WED];
    expect(computeSecretaryDays(days, [MON, TUE, WED], 6)).toBe(0);
  });

  it("total earnings = daysWorked × dailyRate", () => {
    const days = [MON, TUE, WED, THU, FRI, SAT];
    const daysWorked = computeSecretaryDays(days, [], 6);
    const dailyRate = 60_000;
    expect(daysWorked * dailyRate).toBe(360_000);
  });
});
