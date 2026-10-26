import { describe, it, expect } from "vitest";
import { ACTIVITY_CATEGORIES } from "../activity";
import { ACTIVITY_ACTIONS } from "../../activity-log";

describe("ACTIVITY_CATEGORIES", () => {
  it("lists exact action names for each category", () => {
    expect(ACTIVITY_CATEGORIES.day).toEqual(["day.open", "day.close", "day.reopen"]);
    expect(ACTIVITY_CATEGORIES.money).toEqual(
      expect.arrayContaining([
        "checkout.complete",
        "pedido.payment",
        "pedido.refund",
        "payroll.payout",
      ]),
    );
    expect(ACTIVITY_CATEGORIES.money).not.toContain("pedido.create");
  });

  it("puts every action in at least one category", () => {
    const covered = new Set(Object.values(ACTIVITY_CATEGORIES).flat());
    expect(ACTIVITY_ACTIONS.filter((a) => !covered.has(a))).toEqual([]);
  });
});
