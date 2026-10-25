import { describe, it, expect } from "vitest";
import * as s from "../../schema";
import {
  bogotaDate,
  deliveryFlag,
  getPedidoDetail,
  listPedidoOverviews,
  LARGE_PEDIDO_UNITS,
} from "../pedidos";
import {
  describeDb,
  makeClothVariant,
  makeDay,
  makeEmployee,
  withCleanDb,
} from "./helpers/test-db";

// T117 — pedido list and detail derive status, progress and balance from rows.

type Db = Parameters<Parameters<typeof withCleanDb>[0]>[0];

async function setup(db: Db) {
  const admin = await makeEmployee(db, { role: "admin", name: "Admin" });
  const clothier = await makeEmployee(db, { role: "clothier", name: "Luz" });
  const day = await makeDay(db, "2026-10-20T13:00:00Z", { open: true, openedBy: admin.userId });
  const bikini = await makeClothVariant(db, { name: "Bikini", sellingPrice: 45_000 });
  const [s1] = await db.insert(s.garmentSizes).values({ label: "S", sortOrder: 10 }).returning();
  const [m] = await db.insert(s.garmentSizes).values({ label: "M", sortOrder: 20 }).returning();
  const [client] = await db
    .insert(s.clients)
    .values({ name: "Ana Pérez", phone: "3001234567" })
    .returning();
  return { admin, clothier, day, bikini, s: s1!.id, m: m!.id, client: client! };
}

async function makePedido(
  db: Db,
  f: Awaited<ReturnType<typeof setup>>,
  opts: {
    destination?: "client" | "inventory";
    cells: { sizeId?: string; sizeOther?: string; quantity: number }[];
    unitPrice?: number;
    adjustment?: number;
    delivery?: string;
  },
) {
  const destination = opts.destination ?? "client";
  const [pedido] = await db
    .insert(s.pedidos)
    .values({
      destination,
      clientId: destination === "client" ? f.client.id : null,
      createdBy: f.admin.id,
      estimatedDeliveryAt: opts.delivery ? new Date(`${opts.delivery}T00:00:00-05:00`) : null,
    })
    .returning();
  const [line] = await db
    .insert(s.pedidoLines)
    .values({
      pedidoId: pedido!.id,
      kind: "garment",
      clothPieceVariantId: f.bikini.variantId,
      unitPrice: opts.unitPrice ?? 45_000,
    })
    .returning();
  if (opts.adjustment)
    await db.insert(s.pedidoLines).values({
      pedidoId: pedido!.id,
      kind: "adjustment",
      position: 1,
      amount: opts.adjustment,
      priceReason: "ajuste",
    });
  const cells = await db
    .insert(s.pedidoLineCells)
    .values(opts.cells.map((c) => ({ lineId: line!.id, ...c })))
    .returning();
  return { pedido: pedido!, cells };
}

async function assignAndApprove(
  db: Db,
  f: Awaited<ReturnType<typeof setup>>,
  cellId: string,
  qty: { assigned: number; reported?: number; approved?: number; scrapped?: number },
) {
  const [a] = await db
    .insert(s.assignments)
    .values({
      cellId,
      employeeId: f.clothier.id,
      quantity: qty.assigned,
      pieceRate: 12_000,
      source: "assigned",
      createdBy: f.admin.id,
    })
    .returning();
  if (qty.reported)
    await db.insert(s.unitReports).values({
      assignmentId: a!.id,
      quantity: qty.reported,
      businessDayId: f.day,
      reportedBy: f.clothier.id,
    });
  if (qty.approved || qty.scrapped)
    await db.insert(s.unitReviews).values({
      assignmentId: a!.id,
      approved: qty.approved ?? 0,
      scrapped: qty.scrapped ?? 0,
      reason: qty.scrapped ? "dañada" : null,
      businessDayId: f.day,
      reviewedBy: f.admin.id,
    });
  return a!;
}

async function deliver(
  db: Db,
  f: Awaited<ReturnType<typeof setup>>,
  pedidoId: string,
  cellId: string,
  quantity: number,
) {
  const [d] = await db
    .insert(s.deliveries)
    .values({ pedidoId, deliveredBy: f.admin.id })
    .returning();
  await db.insert(s.deliveryCells).values({ deliveryId: d!.id, cellId, quantity });
}

async function pay(db: Db, f: Awaited<ReturnType<typeof setup>>, pedidoId: string, amount: number) {
  await db.insert(s.pedidoPayments).values({
    pedidoId,
    amount,
    method: "cash",
    businessDayId: f.day,
    recordedBy: f.admin.id,
    idempotencyKey: crypto.randomUUID(),
    note: amount < 0 ? "devolución" : null,
  });
}

describeDb("listPedidoOverviews", () => {
  it("derives status, totals and balance per pedido", () =>
    withCleanDb(async (db) => {
      const f = await setup(db);
      const pending = await makePedido(db, f, { cells: [{ sizeId: f.s, quantity: 2 }] });
      const inProd = await makePedido(db, f, {
        cells: [
          { sizeId: f.s, quantity: 6 },
          { sizeId: f.m, quantity: 6 },
        ],
        adjustment: -40_000,
      });
      await assignAndApprove(db, f, inProd.cells[0]!.id, {
        assigned: 6,
        reported: 6,
        approved: 4,
        scrapped: 1,
      });
      await pay(db, f, inProd.pedido.id, 200_000);

      const paidPedido = await makePedido(db, f, { cells: [{ sizeId: f.m, quantity: 3 }] });
      await assignAndApprove(db, f, paidPedido.cells[0]!.id, {
        assigned: 3,
        reported: 3,
        approved: 3,
      });
      await deliver(db, f, paidPedido.pedido.id, paidPedido.cells[0]!.id, 3);
      await pay(db, f, paidPedido.pedido.id, 150_000);
      await pay(db, f, paidPedido.pedido.id, -15_000);

      const list = await listPedidoOverviews(db, { today: "2026-10-24" });
      const byId = new Map(list.map((p) => [p.id, p]));
      expect(byId.get(pending.pedido.id)).toMatchObject({
        status: "pending",
        ordered: 2,
        total: 90_000,
        balance: 90_000,
        isLarge: false,
        clientName: "Ana Pérez",
      });
      expect(byId.get(inProd.pedido.id)).toMatchObject({
        status: "in_production",
        ordered: 12,
        approved: 4,
        total: 12 * 45_000 - 40_000,
        paid: 200_000,
        balance: 300_000,
        isLarge: true,
      });
      expect(byId.get(paidPedido.pedido.id)).toMatchObject({
        status: "paid",
        paid: 135_000,
        balance: 0,
        delivered: 3,
      });
      // Newest first.
      expect(list.map((p) => p.number)).toEqual(
        [...list.map((p) => p.number)].sort((a, b) => b - a),
      );
    }));

  it("filters by destination, status, size, overdue and search", () =>
    withCleanDb(async (db) => {
      const f = await setup(db);
      const late = await makePedido(db, f, {
        cells: [{ sizeId: f.s, quantity: LARGE_PEDIDO_UNITS }],
        delivery: "2026-10-20",
      });
      const inventory = await makePedido(db, f, {
        destination: "inventory",
        cells: [{ sizeOther: "Única", quantity: 1 }],
        delivery: "2026-10-20",
      });
      await assignAndApprove(db, f, inventory.cells[0]!.id, {
        assigned: 1,
        reported: 1,
        approved: 1,
      });

      const today = "2026-10-24";
      const ids = async (filter: Parameters<typeof listPedidoOverviews>[1]) =>
        (await listPedidoOverviews(db, { today, ...filter })).map((p) => p.id);

      expect(await ids({ destination: "inventory" })).toEqual([inventory.pedido.id]);
      expect(await ids({ status: "ready" })).toEqual([inventory.pedido.id]);
      expect(await ids({ large: true })).toEqual([late.pedido.id]);
      // A finished inventory pedido is not late, even past its date.
      expect(await ids({ overdue: true })).toEqual([late.pedido.id]);
      expect(await ids({ q: "ana" })).toEqual([late.pedido.id]);
      expect(await ids({ q: "300123" })).toEqual([late.pedido.id]);
      expect(await ids({ q: `#${String(late.pedido.number).padStart(4, "0")}` })).toEqual([
        late.pedido.id,
      ]);
      expect(await ids({ q: "100%_" })).toEqual([]);
    }));
});

describeDb("getPedidoDetail", () => {
  it("returns lines with per-cell progress, payments and deliveries", () =>
    withCleanDb(async (db) => {
      const f = await setup(db);
      const { pedido, cells } = await makePedido(db, f, {
        cells: [
          { sizeId: f.m, quantity: 4 },
          { sizeId: f.s, quantity: 5 },
          { sizeOther: "Única", quantity: 1 },
        ],
        adjustment: 10_000,
        delivery: "2026-10-24",
      });
      const sCell = cells.find((c) => c.sizeId === f.s)!;
      await assignAndApprove(db, f, sCell.id, { assigned: 5, reported: 5, approved: 5 });
      await deliver(db, f, pedido.id, sCell.id, 2);
      await pay(db, f, pedido.id, 100_000);

      const d = await getPedidoDetail(db, pedido.id, "2026-10-24");
      expect(d).not.toBeNull();
      expect(d!.status).toBe("partially_delivered");
      expect(d!.deliveryFlag).toBe("today");
      expect(d!.total).toBe(10 * 45_000 + 10_000);
      expect(d!.balance).toBe(360_000);
      const line = d!.lines[0]!;
      expect(line.kind).toBe("garment");
      if (line.kind !== "garment") return;
      // List sizes in sort order, free-text sizes last.
      expect(line.cells.map((c) => c.sizeLabel)).toEqual(["S", "M", "Única"]);
      expect(line.cells[0]!.progress).toMatchObject({
        ordered: 5,
        assigned: 5,
        approved: 5,
        delivered: 2,
        readyToDeliver: 3,
      });
      expect(line.progress).toMatchObject({
        ordered: 10,
        approved: 5,
        delivered: 2,
        unassigned: 5,
      });
      expect(d!.lines[1]).toEqual(
        expect.objectContaining({ kind: "adjustment", amount: 10_000, reason: "ajuste" }),
      );
      expect(d!.payments).toHaveLength(1);
      expect(d!.payments[0]!.recordedByName).toBe("Admin");
      expect(d!.deliveries).toEqual([
        expect.objectContaining({ units: 2, deliveredByName: "Admin" }),
      ]);
      expect(d!.createdByName).toBe("Admin");
    }));

  it("returns null for an unknown pedido", () =>
    withCleanDb(async (db) => {
      expect(await getPedidoDetail(db, crypto.randomUUID())).toBeNull();
    }));

  it("reports a cancelled pedido as cancelled", () =>
    withCleanDb(async (db) => {
      const f = await setup(db);
      const { pedido } = await makePedido(db, f, { cells: [{ sizeId: f.s, quantity: 1 }] });
      await db
        .update(s.pedidos)
        .set({ cancelledAt: new Date(), cancellationReason: "cliente desistió" });
      const d = await getPedidoDetail(db, pedido.id);
      expect(d!.status).toBe("cancelled");
      expect(d!.deliveryFlag).toBeNull();
    }));
});

describe("delivery flags", () => {
  it("flags late and due-today pedidos until they are handed over", () => {
    expect(deliveryFlag(null, "pending", "client", "2026-10-24")).toBeNull();
    expect(deliveryFlag("2026-10-23", "in_production", "client", "2026-10-24")).toBe("overdue");
    expect(deliveryFlag("2026-10-24", "ready", "client", "2026-10-24")).toBe("today");
    expect(deliveryFlag("2026-10-25", "pending", "client", "2026-10-24")).toBeNull();
    for (const done of ["delivered", "paid", "cancelled"] as const)
      expect(deliveryFlag("2026-10-01", done, "client", "2026-10-24")).toBeNull();
    expect(deliveryFlag("2026-10-01", "ready", "inventory", "2026-10-24")).toBeNull();
  });

  it("uses the Bogotá calendar day", () => {
    // 2026-10-25 03:00 UTC is still the 24th in Bogotá (UTC-5).
    expect(bogotaDate(new Date("2026-10-25T03:00:00Z"))).toBe("2026-10-24");
  });
});
