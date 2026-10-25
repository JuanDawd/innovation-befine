import { describe, it, expect } from "vitest";
import { activitySummary, formatPesos } from "./activity-log";

describe("activitySummary", () => {
  it("describes auth events", () => {
    expect(activitySummary("auth.sign_in", "user")).toBe("Inició sesión");
    expect(activitySummary("auth.sign_out", "user")).toBe("Cerró sesión");
    expect(activitySummary("auth.sign_in_failed", "user", { email: "ana@befine.co" })).toBe(
      "Intento fallido de inicio de sesión con ana@befine.co",
    );
    expect(activitySummary("auth.sign_in_failed", "user", { email: null })).toBe(
      "Intento fallido de inicio de sesión",
    );
  });

  it("names the catalog entity in Spanish", () => {
    expect(activitySummary("catalog.create", "service", { name: "Corte" })).toBe(
      "Creó el servicio «Corte»",
    );
    expect(activitySummary("catalog.update", "cloth_piece_variant", { name: "Entera" })).toBe(
      "Editó la variante de prenda «Entera»",
    );
    expect(activitySummary("catalog.deactivate", "garment_size", { name: "XS" })).toBe(
      "Desactivó la talla «XS»",
    );
    expect(activitySummary("catalog.restore", "garment_color", { name: "Rojo" })).toBe(
      "Restauró el color «Rojo»",
    );
    expect(activitySummary("catalog.reorder", "garment_size", { name: "M" })).toBe(
      "Cambió el orden de la talla «M»",
    );
  });

  it("works without a name", () => {
    expect(activitySummary("catalog.create", "cloth_piece")).toBe("Creó la prenda");
  });

  it("describes settings changes", () => {
    expect(activitySummary("settings.update", "business_settings", { setting: "límite" })).toBe(
      "Cambió la configuración: límite",
    );
    expect(activitySummary("settings.update", "business_settings")).toBe("Cambió la configuración");
  });
});

describe("activitySummary — clients and pedidos", () => {
  it("names clients and pedidos", () => {
    expect(activitySummary("client.create", "client", { name: "Ana" })).toBe(
      "Creó el cliente «Ana»",
    );
    expect(activitySummary("client.update", "client", { name: "Ana" })).toBe(
      "Editó el cliente «Ana»",
    );
    expect(activitySummary("pedido.create", "pedido", { number: "#0412" })).toBe(
      "Creó el pedido #0412",
    );
    expect(activitySummary("pedido.update", "pedido")).toBe("Editó el pedido");
    expect(activitySummary("pedido.cancel", "pedido", { number: "#0007" })).toBe(
      "Canceló el pedido #0007",
    );
    expect(activitySummary("pedido.deliver", "pedido", { units: 3, number: "#0007" })).toBe(
      "Entregó 3 unidades del pedido #0007",
    );
    expect(activitySummary("production.assign", "pedido", { units: 6, number: "#0007" })).toBe(
      "Asignó 6 unidades del pedido #0007",
    );
    expect(activitySummary("production.rate_change", "pedido", { number: "#0007" })).toBe(
      "Cambió la tarifa de una asignación del pedido #0007",
    );
    expect(activitySummary("production.release", "pedido", { units: 2, number: "#0007" })).toBe(
      "Liberó 2 unidades del pedido #0007",
    );
    expect(activitySummary("production.claim", "pedido", { units: 4, number: "#0007" })).toBe(
      "Tomó 4 unidades del pedido #0007",
    );
    expect(activitySummary("production.report", "pedido", { units: 4, number: "#0007" })).toBe(
      "Reportó 4 unidades terminadas del pedido #0007",
    );
    expect(activitySummary("production.review", "pedido", { number: "#0007" })).toBe(
      "Revisó unidades del pedido #0007",
    );
    expect(activitySummary("production.closing_submit", "employee", { units: 7 })).toBe(
      "Cerró su jornada con 7 unidades",
    );
    expect(activitySummary("production.closing_submit", "employee")).toBe("Cerró su jornada");
    expect(activitySummary("production.closing_approve", "employee", { name: "Luz" })).toBe(
      "Aprobó el cierre de jornada de Luz",
    );
    expect(activitySummary("production.closing_approve", "employee")).toBe(
      "Aprobó el cierre de jornada",
    );
  });
});

describe("formatPesos", () => {
  it("formats whole COP with dot separators", () => {
    expect(formatPesos(0)).toBe("$0");
    expect(formatPesos(12_500)).toBe("$12.500");
    expect(formatPesos(1_234_567)).toBe("$1.234.567");
    expect(formatPesos(-50_000)).toBe("-$50.000");
  });
});
