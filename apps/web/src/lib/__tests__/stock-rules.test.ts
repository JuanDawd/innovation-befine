import { describe, it, expect } from "vitest";
import { checkSaleStock, checkStockChange, stockLockKey } from "../stock-rules";

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

describe("checkSaleStock", () => {
  it("sells up to what is on hand", () => {
    expect(checkSaleStock({ quantity: 2, onHand: 2, isAdmin: false })).toBeNull();
  });

  it("blocks overselling with how many are left", () => {
    expect(checkSaleStock({ quantity: 2, onHand: 1, isAdmin: false })).toBe(
      "Solo queda 1 disponible. Alguien pudo vender mientras tanto.",
    );
    expect(checkSaleStock({ quantity: 4, onHand: 3, isAdmin: true })).toMatch(/^Solo quedan 3/);
    expect(checkSaleStock({ quantity: 1, onHand: 0, isAdmin: false })).toMatch(
      /No hay existencias/,
    );
  });

  it("lets only the admin oversell, and only with a reason", () => {
    const base = { quantity: 2, onHand: 0, oversell: true };
    expect(checkSaleStock({ ...base, isAdmin: false, oversellReason: "x" })).toMatch(
      /administrador/,
    );
    expect(checkSaleStock({ ...base, isAdmin: true, oversellReason: " " })).toMatch(/motivo/);
    expect(
      checkSaleStock({ ...base, isAdmin: true, oversellReason: "conteo pendiente" }),
    ).toBeNull();
  });
});

describe("stockLockKey", () => {
  it("is the same for the same item, null parts included", () => {
    expect(stockLockKey({ clothPieceVariantId: "v", sizeId: null, colorId: "c" })).toBe(
      "stock:v:-:c",
    );
  });
});
