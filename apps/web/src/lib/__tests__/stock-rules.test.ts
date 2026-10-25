import { describe, it, expect } from "vitest";
import { checkStockChange } from "../stock-rules";

describe("checkStockChange", () => {
  it("adds stock freely and removes down to 0", () => {
    expect(checkStockChange({ quantity: 5, onHand: 0 })).toBeNull();
    expect(checkStockChange({ quantity: -3, onHand: 3 })).toBeNull();
  });

  it("never goes below 0 without the admin override", () => {
    expect(checkStockChange({ quantity: -4, onHand: 3 })).toBe(
      "Solo hay 3 en inventario: no se pueden sacar 4.",
    );
    expect(checkStockChange({ quantity: -1, onHand: 0 })).toBe(
      "No hay unidades en inventario para sacar.",
    );
    expect(checkStockChange({ quantity: -4, onHand: 3, allowNegative: true })).toBeNull();
  });

  it("rejects 0 and fractional quantities", () => {
    expect(checkStockChange({ quantity: 0, onHand: 3 })).toMatch(/distinto de 0/);
    expect(checkStockChange({ quantity: 1.5, onHand: 3 })).toMatch(/entero/);
  });
});
