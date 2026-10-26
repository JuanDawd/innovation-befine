import { describe, it, expect } from "vitest";
import {
  computePedidoTotal,
  formatPedidoNumber,
  lineTotal,
  lineUnits,
  priceNeedsReason,
  type PedidoTotalLine,
} from "./pedido-totals";

const garment = (unitPrice: number, ...quantities: number[]): PedidoTotalLine => ({
  kind: "garment",
  unitPrice,
  cells: quantities.map((quantity) => ({ quantity })),
});

describe("computePedidoTotal", () => {
  it("sums garment cells × unit price", () => {
    // Bikini $45.000: S 3, M 5, L 2 = 10 units → $450.000
    // Blusa  $38.500: M 4                     → $154.000
    expect(computePedidoTotal([garment(45_000, 3, 5, 2), garment(38_500, 4)])).toBe(604_000);
  });

  it("adds positive and negative adjustment lines", () => {
    const lines: PedidoTotalLine[] = [
      garment(45_000, 10),
      { kind: "adjustment", amount: 25_000 }, // bordado urgente
      { kind: "adjustment", amount: -50_000 }, // descuento por volumen
    ];
    expect(computePedidoTotal(lines)).toBe(425_000);
  });

  it("is $0 for an empty pedido and for $0 lines", () => {
    expect(computePedidoTotal([])).toBe(0);
    expect(computePedidoTotal([garment(0, 12)])).toBe(0);
  });

  it("allows a discount down to exactly $0 total", () => {
    expect(computePedidoTotal([garment(10_000, 1), { kind: "adjustment", amount: -10_000 }])).toBe(
      0,
    );
  });

  it("stays an exact integer at large sizes", () => {
    // 1.500 units × $123.457 — no float artefacts
    const total = computePedidoTotal([garment(123_457, 500, 500, 500)]);
    expect(total).toBe(185_185_500);
    expect(Number.isInteger(total)).toBe(true);
  });

  it("rejects totals beyond safe integers", () => {
    expect(() => computePedidoTotal([garment(Number.MAX_SAFE_INTEGER, 2)])).toThrow(RangeError);
  });
});

describe("lineTotal", () => {
  it("rejects fractional or negative prices and fractional adjustments", () => {
    expect(() => lineTotal(garment(100.5, 1))).toThrow(RangeError);
    expect(() => lineTotal(garment(-1, 1))).toThrow(RangeError);
    expect(() => lineTotal({ kind: "adjustment", amount: 0.5 })).toThrow(RangeError);
  });
});

describe("lineUnits", () => {
  it("sums the size grid", () => {
    expect(lineUnits([{ quantity: 3 }, { quantity: 7 }])).toBe(10);
    expect(lineUnits([])).toBe(0);
  });

  it.each([0, -2, 1.5])("rejects a cell quantity of %s", (quantity) => {
    expect(() => lineUnits([{ quantity }])).toThrow(RangeError);
  });
});

describe("priceNeedsReason", () => {
  it("is false only when the price equals the selling price", () => {
    expect(priceNeedsReason(45_000, 45_000)).toBe(false);
    expect(priceNeedsReason(40_000, 45_000)).toBe(true);
    expect(priceNeedsReason(0, 45_000)).toBe(true);
  });

  it("always needs a reason when the variant has no selling price", () => {
    expect(priceNeedsReason(45_000, null)).toBe(true);
  });
});

describe("formatPedidoNumber", () => {
  it("pads to four digits and grows beyond", () => {
    expect(formatPedidoNumber(7)).toBe("#0007");
    expect(formatPedidoNumber(412)).toBe("#0412");
    expect(formatPedidoNumber(12345)).toBe("#12345");
  });
});
