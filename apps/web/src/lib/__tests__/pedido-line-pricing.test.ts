import { describe, it, expect } from "vitest";
import { resolveLinePrice } from "../pedido-line-pricing";

describe("resolveLinePrice", () => {
  it("accepts the selling price without a reason, for any role", () => {
    for (const canEditPrices of [true, false]) {
      expect(resolveLinePrice({ unitPrice: 45_000, sellingPrice: 45_000, canEditPrices })).toEqual({
        ok: true,
        unitPrice: 45_000,
        priceReason: null,
      });
    }
  });

  it("drops a stray reason when the price is the catalog price", () => {
    const r = resolveLinePrice({
      unitPrice: 45_000,
      priceReason: "x",
      sellingPrice: 45_000,
      canEditPrices: true,
    });
    expect(r).toEqual({ ok: true, unitPrice: 45_000, priceReason: null });
  });

  it("requires a reason for a different price", () => {
    const missing = resolveLinePrice({
      unitPrice: 40_000,
      sellingPrice: 45_000,
      canEditPrices: true,
    });
    expect(missing).toEqual({ ok: false, message: "Escribe el motivo del cambio de precio." });
    const blank = resolveLinePrice({
      unitPrice: 40_000,
      priceReason: "   ",
      sellingPrice: 45_000,
      canEditPrices: true,
    });
    expect(blank.ok).toBe(false);
    const given = resolveLinePrice({
      unitPrice: 40_000,
      priceReason: " cliente frecuente ",
      sellingPrice: 45_000,
      canEditPrices: true,
    });
    expect(given).toEqual({ ok: true, unitPrice: 40_000, priceReason: "cliente frecuente" });
  });

  it("allows a $0 price with a reason", () => {
    const r = resolveLinePrice({
      unitPrice: 0,
      priceReason: "cortesía",
      sellingPrice: 45_000,
      canEditPrices: true,
    });
    expect(r).toEqual({ ok: true, unitPrice: 0, priceReason: "cortesía" });
  });

  it("forbids the secretary from changing a price", () => {
    const r = resolveLinePrice({
      unitPrice: 40_000,
      priceReason: "descuento",
      sellingPrice: 45_000,
      canEditPrices: false,
    });
    expect(r.ok).toBe(false);
  });

  it("needs a typed price and reason when the variant has no selling price", () => {
    expect(
      resolveLinePrice({ unitPrice: 30_000, sellingPrice: null, canEditPrices: true }).ok,
    ).toBe(false);
    expect(
      resolveLinePrice({
        unitPrice: 30_000,
        priceReason: "precio acordado",
        sellingPrice: null,
        canEditPrices: true,
      }),
    ).toEqual({ ok: true, unitPrice: 30_000, priceReason: "precio acordado" });
    const secretary = resolveLinePrice({
      unitPrice: 30_000,
      priceReason: "x",
      sellingPrice: null,
      canEditPrices: false,
    });
    expect(!secretary.ok && secretary.message).toMatch(/no tiene precio de venta/);
  });

  it("keeps an existing snapshot when the price is unchanged, even for the secretary", () => {
    // Catalog price rose to $50.000 after the line was created at $45.000.
    const r = resolveLinePrice({
      unitPrice: 45_000,
      sellingPrice: 50_000,
      canEditPrices: false,
      existing: { unitPrice: 45_000, priceReason: null },
    });
    expect(r).toEqual({ ok: true, unitPrice: 45_000, priceReason: null });
    const withReason = resolveLinePrice({
      unitPrice: 40_000,
      sellingPrice: 45_000,
      canEditPrices: false,
      existing: { unitPrice: 40_000, priceReason: "cliente frecuente" },
    });
    expect(withReason).toEqual({ ok: true, unitPrice: 40_000, priceReason: "cliente frecuente" });
  });

  it("treats a changed existing price like a new one", () => {
    const r = resolveLinePrice({
      unitPrice: 38_000,
      sellingPrice: 45_000,
      canEditPrices: false,
      existing: { unitPrice: 40_000, priceReason: "cliente frecuente" },
    });
    expect(r.ok).toBe(false);
  });
});
