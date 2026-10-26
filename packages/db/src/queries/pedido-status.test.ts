import { describe, it, expect } from "vitest";
import { derivePedidoStatus, isFinishedPedido, type PedidoStatusInput } from "./pedido-status";
import { summarizeCell, sumProgress } from "./pedido-progress";
import { computePedidoBalance } from "./pedido-balance";

const zero = { ordered: 150, assigned: 0, reported: 0, approved: 0, delivered: 0 };
const input = (over: Partial<PedidoStatusInput> & { p?: Partial<typeof zero> } = {}) => ({
  destination: "client" as const,
  cancelled: false,
  balance: 450_000,
  ...over,
  progress: { ...zero, ...over.p },
});
const status = (over: Parameters<typeof input>[0] = {}) => derivePedidoStatus(input(over)).status;

describe("derivePedidoStatus", () => {
  it("is Pendiente until a unit is assigned or claimed", () => {
    expect(status()).toBe("pending");
  });

  it("is Pendiente for a pedido with no units", () => {
    expect(status({ p: { ordered: 0 } })).toBe("pending");
  });

  it("is En producción from the first assigned, reported or approved unit", () => {
    expect(status({ p: { assigned: 1 } })).toBe("in_production");
    // All assigned units were scrapped (re-opened), but some had been approved.
    expect(status({ p: { assigned: 0, reported: 0, approved: 3 } })).toBe("in_production");
    expect(status({ p: { assigned: 0, reported: 2 } })).toBe("in_production");
  });

  it("is Listo when approved units reach ordered units", () => {
    const r = derivePedidoStatus(input({ p: { assigned: 150, reported: 150, approved: 150 } }));
    expect(r).toEqual({
      status: "ready",
      detail: { ordered: 150, approved: 150, delivered: 0, balance: 450_000 },
    });
  });

  it("explains partial progress with the numbers", () => {
    const r = derivePedidoStatus(input({ p: { assigned: 150, reported: 140, approved: 128 } }));
    expect(r.status).toBe("in_production");
    expect(r.detail).toMatchObject({ approved: 128, ordered: 150 });
  });

  it("is Entrega parcial after some units are delivered", () => {
    expect(status({ p: { assigned: 150, approved: 150, delivered: 40 } })).toBe(
      "partially_delivered",
    );
    // Delivering ready units while others are still in production.
    expect(status({ p: { assigned: 150, approved: 60, delivered: 60 } })).toBe(
      "partially_delivered",
    );
  });

  it("is Entregado when all units are delivered with a balance due", () => {
    expect(status({ p: { approved: 150, delivered: 150 }, balance: 100_000 })).toBe("delivered");
  });

  it("is Pagado only when delivered and the balance is $0", () => {
    expect(status({ p: { approved: 150, delivered: 150 }, balance: 0 })).toBe("paid");
  });

  it("stays Listo when paid in full before delivery", () => {
    expect(status({ p: { assigned: 150, approved: 150 }, balance: 0 })).toBe("ready");
  });

  it("stays En producción when paid in advance", () => {
    expect(status({ p: { assigned: 10 }, balance: 0 })).toBe("in_production");
  });

  it("ends inventory pedidos at Listo and ignores deliveries and balance", () => {
    const inv = { destination: "inventory" as const, balance: 0 };
    expect(status({ ...inv })).toBe("pending");
    expect(status({ ...inv, p: { assigned: 5 } })).toBe("in_production");
    expect(status({ ...inv, p: { approved: 150 } })).toBe("ready");
  });

  it("is Cancelado whatever the numbers say", () => {
    expect(status({ cancelled: true, p: { approved: 150, delivered: 150 }, balance: 0 })).toBe(
      "cancelled",
    );
  });

  it("follows a restructure that removes undelivered approved units", () => {
    // 150 ordered, 120 approved, 100 delivered → restructure takes the 20
    // approved-undelivered units out and cuts the order to 100.
    const before = status({ p: { assigned: 150, approved: 120, delivered: 100 } });
    const after = status({ p: { ordered: 100, assigned: 100, approved: 100, delivered: 100 } });
    expect(before).toBe("partially_delivered");
    expect(after).toBe("delivered");
  });

  it("works end to end from cells and payments", () => {
    const cells = [
      summarizeCell({
        quantity: 5,
        assignments: [
          {
            quantity: 5,
            reports: [{ quantity: 5, kind: "report" }],
            reviews: [{ approved: 5, returned: 0, scrapped: 0 }],
          },
        ],
        deliveries: [{ quantity: 5 }],
      }),
    ];
    const { balance } = computePedidoBalance(225_000, [{ amount: 100_000 }, { amount: 125_000 }]);
    expect(
      derivePedidoStatus({
        destination: "client",
        cancelled: false,
        progress: sumProgress(cells),
        balance,
      }).status,
    ).toBe("paid");
  });
});

describe("isFinishedPedido", () => {
  it("finishes inventory pedidos at Listo and client pedidos at Pagado", () => {
    expect(isFinishedPedido("inventory", "ready")).toBe(true);
    expect(isFinishedPedido("client", "ready")).toBe(false);
    expect(isFinishedPedido("client", "paid")).toBe(true);
    expect(isFinishedPedido("client", "cancelled")).toBe(true);
    expect(isFinishedPedido("inventory", "in_production")).toBe(false);
  });
});

describe("pedido status storage", () => {
  it("has no status column — status is always derived", async () => {
    const { getTableColumns } = await import("drizzle-orm");
    const { pedidos } = await import("../schema");
    const columns = Object.values(getTableColumns(pedidos)).map((c) => c.name);
    expect(columns.some((c) => c.includes("status"))).toBe(false);
    // Cancellation is the only manual state.
    expect(columns).toEqual(expect.arrayContaining(["cancelled_at", "cancellation_reason"]));
  });
});
