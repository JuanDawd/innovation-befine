import { describe, it, expect, vi, beforeEach } from "vitest";

// T127 — who may record pedido payments (unit; the money flow itself is in
// payments.integration.test.ts against a real database).

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  secretaryCanRecordPedidoPayments: false,
  txCalls: 0,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (state.role ? { user: { id: "u1", role: state.role } } : null),
    },
  },
}));
vi.mock("@/lib/employee-ref", () => ({ getEmployeeRef: async () => ({ id: "e1" }) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/business-settings", () => ({
  getBusinessSettings: async () => ({
    secretaryCanRecordPedidoPayments: state.secretaryCanRecordPedidoPayments,
  }),
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({}),
  getTxDb: () => ({
    transaction: async () => {
      state.txCalls++;
      throw new Error("stop: reached the database");
    },
  }),
}));

import { recordPedidoPayment } from "../payment-actions";

const PEDIDO = "00000000-0000-4000-8000-0000000000d1";
const input = {
  kind: "payment",
  amount: 50_000,
  method: "cash",
  idempotencyKey: "00000000-0000-4000-8000-0000000000aa",
};

describe("recordPedidoPayment — access", () => {
  beforeEach(() => {
    state.role = "admin";
    state.secretaryCanRecordPedidoPayments = false;
    state.txCalls = 0;
  });

  it.each(["admin", "cashier"])("lets %s through to the database", async (role) => {
    state.role = role;
    await expect(recordPedidoPayment(PEDIDO, input)).rejects.toThrow(/reached the database/);
    expect(state.txCalls).toBe(1);
  });

  it("refuses the secretary while the setting is off", async () => {
    state.role = "secretary";
    const res = await recordPedidoPayment(PEDIDO, input);
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    expect(state.txCalls).toBe(0);
  });

  it("lets the secretary record payments when the setting is on", async () => {
    state.role = "secretary";
    state.secretaryCanRecordPedidoPayments = true;
    await expect(recordPedidoPayment(PEDIDO, input)).rejects.toThrow(/reached the database/);
  });

  it.each(["stylist", "clothier"])("returns FORBIDDEN for %s", async (role) => {
    state.role = role;
    const res = await recordPedidoPayment(PEDIDO, input);
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });

  it("validates before touching the database", async () => {
    const bad = await recordPedidoPayment(PEDIDO, { ...input, amount: 10.5 });
    expect(!bad.success && bad.error.code).toBe("VALIDATION_ERROR");
    const badId = await recordPedidoPayment("x", input);
    expect(!badId.success && badId.error.code).toBe("NOT_FOUND");
    expect(state.txCalls).toBe(0);
  });
});
