import { describe, it, expect } from "vitest";
import { orderUnitPrice } from "@/lib/large-order-pricing";

describe("orderUnitPrice", () => {
  it("charges the selling price, not the clothier's piece rate", () => {
    expect(orderUnitPrice({ sellingPrice: 35_000, pieceRate: 8_000 })).toBe(35_000);
  });

  it("leaves the price to be typed when the piece isn't for sale", () => {
    expect(orderUnitPrice({ sellingPrice: null, pieceRate: 8_000 })).toBe(0);
  });

  it("is 0 when no variant is chosen", () => {
    expect(orderUnitPrice(undefined)).toBe(0);
  });
});
