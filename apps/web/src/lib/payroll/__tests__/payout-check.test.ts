import { describe, it, expect } from "vitest";
import { checkPayout } from "@/lib/payroll/payout-check";

const base = { amount: 151_750, originalComputedAmount: 151_750, serverComputedAmount: 151_750 };

describe("checkPayout", () => {
  it("accepts the computed amount", () => {
    expect(checkPayout(base)).toBeNull();
  });

  it("refuses when the server's figure changed since the preview", () => {
    const err = checkPayout({ ...base, serverComputedAmount: 171_000 });
    expect(err?.code).toBe("STALE_DATA");
    expect(err?.message).toContain("$171.000");
  });

  it("refuses a stale preview even when the admin typed the old amount with a reason", () => {
    const err = checkPayout({ ...base, serverComputedAmount: 0, adjustmentReason: "acuerdo" });
    expect(err?.code).toBe("STALE_DATA");
  });

  it("refuses a $0 payout", () => {
    expect(
      checkPayout({ amount: 0, originalComputedAmount: 0, serverComputedAmount: 0 })?.code,
    ).toBe("VALIDATION_ERROR");
  });

  it("requires a reason for an adjusted amount", () => {
    expect(checkPayout({ ...base, amount: 150_000 })?.code).toBe("VALIDATION_ERROR");
    expect(checkPayout({ ...base, amount: 150_000, adjustmentReason: "  " })?.code).toBe(
      "VALIDATION_ERROR",
    );
    expect(checkPayout({ ...base, amount: 150_000, adjustmentReason: "Adelanto" })).toBeNull();
  });
});
