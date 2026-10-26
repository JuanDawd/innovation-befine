import { describe, it, expect } from "vitest";
import { activityDiff } from "../activity-diff";

describe("activityDiff", () => {
  it("shows only what changed, labelled in Spanish, money as $12.500", () => {
    expect(
      activityDiff(
        { name: "Rosa", role: "clothier", dailyRate: null, version: 3 },
        { name: "Rosa Pérez", role: "clothier", dailyRate: 60000, version: 4 },
      ),
    ).toEqual([
      { key: "name", label: "Nombre", before: "Rosa", after: "Rosa Pérez" },
      { key: "dailyRate", label: "Tarifa diaria", before: null, after: "$60.000" },
    ]);
  });

  it("lists the facts of a one-sided entry", () => {
    expect(activityDiff(null, { amount: 350000, method: "card", afterHours: false })).toEqual([
      { key: "amount", label: "Valor", before: null, after: "$350.000" },
      { key: "method", label: "Medio de pago", before: null, after: "tarjeta" },
      { key: "afterHours", label: "Fuera de horario", before: null, after: "No" },
    ]);
  });

  it("formats payments, booleans and Bogotá dates; hides ids and nested objects", () => {
    const rows = activityDiff(
      { status: "closed", closedAt: "2026-10-25T23:30:00.000Z" },
      {
        status: "reopened",
        closedAt: null,
        checkoutSessionId: "x",
        bySource: { services: 1 },
        payments: [
          { method: "cash", amount: 45000 },
          { method: "card", amount: 5000 },
        ],
      },
    );
    expect(rows).toEqual([
      { key: "status", label: "Estado", before: "cobrado", after: "reabierto" },
      { key: "closedAt", label: "Cerrado", before: "25/10/2026 18:30", after: null },
      { key: "payments", label: "Pagos", before: null, after: "$45.000 efectivo + $5.000 tarjeta" },
    ]);
  });

  it("is empty when nothing readable is there", () => {
    expect(activityDiff(null, null)).toEqual([]);
    expect(activityDiff({ id: "a" }, { id: "b" })).toEqual([]);
  });
});
