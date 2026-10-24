import { describe, it, expect } from "vitest";
import { amountDue, paymentsMatchDue } from "@/lib/checkout-due";

describe("amountDue", () => {
  it("is the full total for tickets never paid", () => {
    expect(
      amountDue([
        { total: 120_000, prepaid: 0 },
        { total: 25_000, prepaid: 0 },
      ]),
    ).toBe(145_000);
  });

  it("charges only the difference on a reopened ticket that got pricier", () => {
    expect(amountDue([{ total: 55_000, prepaid: 45_000 }])).toBe(10_000);
  });

  it("is negative (a refund) when the reopened ticket got cheaper", () => {
    expect(amountDue([{ total: 25_000, prepaid: 45_000 }])).toBe(-20_000);
  });

  it("is zero when the reopened ticket kept its price", () => {
    expect(amountDue([{ total: 45_000, prepaid: 45_000 }])).toBe(0);
  });
});

describe("paymentsMatchDue", () => {
  it("accepts a split that adds up", () => {
    expect(paymentsMatchDue(120_000, [{ amount: 20_000 }, { amount: 100_000 }])).toBe(true);
  });

  it("rejects a sum that doesn't match", () => {
    expect(paymentsMatchDue(120_000, [{ amount: 100_000 }])).toBe(false);
  });

  it("accepts a refund recorded as negative amounts", () => {
    expect(paymentsMatchDue(-20_000, [{ amount: -20_000 }])).toBe(true);
  });

  it("rejects mixing charges and refunds", () => {
    expect(paymentsMatchDue(10_000, [{ amount: 30_000 }, { amount: -20_000 }])).toBe(false);
  });

  it("requires no payment lines when nothing is due", () => {
    expect(paymentsMatchDue(0, [])).toBe(true);
    expect(paymentsMatchDue(0, [{ amount: 5_000 }, { amount: -5_000 }])).toBe(false);
  });

  it("requires payments when something is due", () => {
    expect(paymentsMatchDue(10_000, [])).toBe(false);
  });
});
