import { describe, it, expect } from "vitest";
import { afterHoursNote, checkPedidoPayment, type PaymentCheckInput } from "../pedido-payments";

const base = (over: Partial<PaymentCheckInput> = {}): PaymentCheckInput => ({
  kind: "payment",
  amount: 100_000,
  destination: "client",
  cancelled: false,
  paid: 0,
  balance: 450_000,
  saldoAFavor: 0,
  ...over,
});

describe("checkPedidoPayment — payments", () => {
  it("accepts a partial payment and the exact balance", () => {
    expect(checkPedidoPayment(base())).toBeNull();
    expect(checkPedidoPayment(base({ amount: 450_000 }))).toBeNull();
  });

  it("refuses more than the balance, a paid pedido and $0 / fractional amounts", () => {
    expect(checkPedidoPayment(base({ amount: 450_001 }))).toMatch(/El saldo es \$450\.000/);
    expect(checkPedidoPayment(base({ balance: 0 }))).toBe("Este pedido ya está pagado.");
    expect(checkPedidoPayment(base({ amount: 0 }))).toMatch(/mayor que \$0/);
    expect(checkPedidoPayment(base({ amount: 10.5 }))).toMatch(/número entero/);
    expect(checkPedidoPayment(base({ amount: -5 }))).toMatch(/mayor que \$0/);
  });

  it("refuses cancelled and inventory pedidos", () => {
    expect(checkPedidoPayment(base({ cancelled: true }))).toMatch(/cancelado/);
    expect(checkPedidoPayment(base({ destination: "inventory" }))).toMatch(/inventario/);
  });
});

describe("checkPedidoPayment — refunds", () => {
  const refund = (over: Partial<PaymentCheckInput> = {}) =>
    checkPedidoPayment(base({ kind: "refund", note: "precio rebajado", ...over }));

  it("refunds saldo a favor, up to its amount", () => {
    expect(refund({ paid: 450_000, balance: 0, saldoAFavor: 50_000, amount: 50_000 })).toBeNull();
    expect(refund({ paid: 450_000, balance: 0, saldoAFavor: 50_000, amount: 50_001 })).toMatch(
      /Solo se pueden devolver \$50\.000/,
    );
  });

  it("refunds everything paid once the pedido is cancelled", () => {
    expect(refund({ cancelled: true, paid: 200_000, amount: 200_000 })).toBeNull();
    expect(refund({ cancelled: true, paid: 200_000, amount: 200_001 })).toMatch(/\$200\.000/);
  });

  it("needs a note, something paid and something owed back", () => {
    expect(refund({ note: " ", paid: 10_000, saldoAFavor: 10_000 })).toMatch(/motivo/);
    expect(refund({ paid: 0 })).toMatch(/no tiene pagos/);
    expect(refund({ paid: 100_000, balance: 350_000, saldoAFavor: 0 })).toMatch(
      /No hay saldo a favor/,
    );
  });
});

describe("afterHoursNote", () => {
  it("states the real received time in Bogotá", () => {
    // 2026-10-25 02:15 UTC = 24 Oct 21:15 in Bogotá
    expect(afterHoursNote(new Date("2026-10-25T02:15:00Z"))).toMatch(
      /^Pagado fuera de horario el 24 (de )?oct a las 9:15/,
    );
  });
});
