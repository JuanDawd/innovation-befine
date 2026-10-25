import { describe, it, expect } from "vitest";
import { computePedidoBalance } from "./pedido-balance";
import { computePedidoTotal } from "./pedido-totals";

describe("computePedidoBalance", () => {
  it("owes the full total with no payments", () => {
    expect(computePedidoBalance(450_000, [])).toEqual({
      total: 450_000,
      paid: 0,
      balance: 450_000,
      saldoAFavor: 0,
    });
  });

  it("subtracts partial payments", () => {
    // 50 % deposit, then $100.000 more
    const b = computePedidoBalance(450_000, [{ amount: 225_000 }, { amount: 100_000 }]);
    expect(b).toMatchObject({ paid: 325_000, balance: 125_000, saldoAFavor: 0 });
  });

  it("is settled at exactly the total", () => {
    const b = computePedidoBalance(450_000, [{ amount: 450_000 }]);
    expect(b).toMatchObject({ balance: 0, saldoAFavor: 0 });
  });

  it("counts refunds as negative payments", () => {
    const b = computePedidoBalance(450_000, [{ amount: 450_000 }, { amount: -50_000 }]);
    expect(b).toMatchObject({ paid: 400_000, balance: 50_000, saldoAFavor: 0 });
  });

  it("turns overpayment into saldo a favor, never a negative balance", () => {
    // Paid $450.000, then a discount adjustment line cuts the total by $50.000
    const total = computePedidoTotal([
      { kind: "garment", unitPrice: 45_000, cells: [{ quantity: 10 }] },
      { kind: "adjustment", amount: -50_000 },
    ]);
    const b = computePedidoBalance(total, [{ amount: 450_000 }]);
    expect(b).toEqual({ total: 400_000, paid: 450_000, balance: 0, saldoAFavor: 50_000 });
  });

  it("clears saldo a favor once it is refunded", () => {
    const b = computePedidoBalance(400_000, [{ amount: 450_000 }, { amount: -50_000 }]);
    expect(b).toMatchObject({ balance: 0, saldoAFavor: 0 });
  });

  it("handles a $0 pedido", () => {
    expect(computePedidoBalance(0, [])).toMatchObject({ balance: 0, saldoAFavor: 0 });
  });

  it("rejects non-integer amounts", () => {
    expect(() => computePedidoBalance(100.5, [])).toThrow(RangeError);
    expect(() => computePedidoBalance(100, [{ amount: 0.5 }])).toThrow(RangeError);
  });
});
