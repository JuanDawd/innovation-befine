import { it, expect } from "vitest";
import { sql } from "drizzle-orm";
import * as s from "../../schema";
import {
  inventoryFiguresForPeriod,
  inventoryFiguresNow,
  pedidoFiguresForPeriod,
  pedidoFiguresNow,
  productionFigures,
} from "../analytics-pedidos";
import {
  describeDb,
  makeClothVariant,
  makeDay,
  makeEmployee,
  withCleanDb,
} from "./helpers/test-db";

// T133 — Analítica figures reconcile with the ledgers on known data.
// Window: Mon 2026-10-19 … Sun 2026-10-25 (Bogotá); "today" = 2026-10-25.

type Db = Parameters<Parameters<typeof withCleanDb>[0]>[0];
const W = {
  start: new Date("2026-10-19T00:00:00-05:00"),
  end: new Date("2026-10-25T23:59:59-05:00"),
};
const NOW = new Date("2026-10-25T15:00:00-05:00");

async function scenario(db: Db) {
  const admin = await makeEmployee(db, { role: "admin" });
  const luz = await makeEmployee(db, { role: "clothier", name: "Luz" });
  const ana = await makeEmployee(db, { role: "clothier", name: "Ana" });
  const day = await makeDay(db, "2026-10-24T13:00:00Z", { open: true, openedBy: admin.userId });
  const bata = await makeClothVariant(db, { name: "Bata", pieceRate: 8_000, sellingPrice: 50_000 });
  const kimono = await makeClothVariant(db, {
    name: "Kimono",
    pieceRate: 6_000,
    sellingPrice: 30_000,
  });
  const [size] = await db.insert(s.garmentSizes).values({ label: "M" }).returning();
  const [client] = await db
    .insert(s.clients)
    .values({ name: "Ana Pérez", phone: "3001112233" })
    .returning();

  const pedido = async (o: {
    variant: string;
    price: number;
    qty: number;
    created: string;
    promise?: string;
    cancelled?: boolean;
  }) => {
    const [p] = await db
      .insert(s.pedidos)
      .values({
        destination: "client",
        clientId: client!.id,
        createdBy: admin.id,
        createdAt: new Date(o.created),
        estimatedDeliveryAt: o.promise ? new Date(`${o.promise}T12:00:00-05:00`) : null,
        cancelledAt: o.cancelled ? new Date(o.created) : null,
        cancellationReason: o.cancelled ? "desistió" : null,
      })
      .returning();
    const [l] = await db
      .insert(s.pedidoLines)
      .values({
        pedidoId: p!.id,
        kind: "garment",
        clothPieceVariantId: o.variant,
        unitPrice: o.price,
      })
      .returning();
    const [c] = await db
      .insert(s.pedidoLineCells)
      .values({ lineId: l!.id, sizeId: size!.id, quantity: o.qty })
      .returning();
    return { id: p!.id, cellId: c!.id };
  };
  const produce = async (
    cellId: string,
    who: string,
    rate: number,
    rev: { approved: number; returned?: number; scrapped?: number },
  ) => {
    const total = rev.approved + (rev.returned ?? 0) + (rev.scrapped ?? 0);
    const [a] = await db
      .insert(s.assignments)
      .values({
        cellId,
        employeeId: who,
        quantity: total,
        pieceRate: rate,
        source: "assigned",
        createdBy: admin.id,
        createdAt: new Date("2026-10-22T09:00:00-05:00"),
      })
      .returning();
    await db.insert(s.unitReports).values({
      assignmentId: a!.id,
      quantity: total,
      kind: "report",
      businessDayId: day,
      reportedBy: who,
    });
    await db.insert(s.unitReviews).values({
      assignmentId: a!.id,
      approved: rev.approved,
      returned: rev.returned ?? 0,
      scrapped: rev.scrapped ?? 0,
      reason: rev.returned ? "Costura" : null,
      returnCode: rev.returned ? "costura" : null,
      scrapCode: rev.scrapped ? "mancha" : null,
      scrapReason: rev.scrapped ? "Mancha" : null,
      businessDayId: day,
      reviewedBy: admin.id,
      createdAt: new Date("2026-10-24T09:00:00-05:00"), // 48 h after assignment
    });
  };
  const pay = (pedidoId: string, amount: number) =>
    db.insert(s.pedidoPayments).values({
      pedidoId,
      amount,
      method: "cash",
      businessDayId: day,
      recordedBy: admin.id,
      idempotencyKey: crypto.randomUUID(),
    });
  const deliver = async (pedidoId: string, cellId: string, quantity: number, at: string) => {
    const [d] = await db
      .insert(s.deliveries)
      .values({
        pedidoId,
        deliveredAt: new Date(at),
        deliveredBy: admin.id,
        idempotencyKey: crypto.randomUUID(),
      })
      .returning();
    await db.insert(s.deliveryCells).values({ deliveryId: d!.id, cellId, quantity });
  };

  // A: 10 batas × $50.000, promised Oct 22, 8 approved and delivered, $200.000 paid → overdue, owes $300.000
  const A = await pedido({
    variant: bata.variantId,
    price: 50_000,
    qty: 10,
    created: "2026-10-20T10:00:00-05:00",
    promise: "2026-10-22",
  });
  await produce(A.cellId, luz.id, 8_000, { approved: 8, returned: 1, scrapped: 1 });
  await pay(A.id, 200_000);
  await deliver(A.id, A.cellId, 8, "2026-10-24T11:00:00-05:00");
  // B: 2 kimonos × $30.000, promised Oct 21, delivered in full Oct 23 (late), $70.000 paid → saldo a favor $10.000
  const B = await pedido({
    variant: kimono.variantId,
    price: 30_000,
    qty: 2,
    created: "2026-10-18T10:00:00-05:00",
    promise: "2026-10-21",
  });
  await produce(B.cellId, ana.id, 6_000, { approved: 2 });
  await pay(B.id, 70_000);
  await deliver(B.id, B.cellId, 2, "2026-10-23T10:00:00-05:00");
  // C: cancelled with $30.000 paid → all of it owed back, not a receivable
  const C = await pedido({
    variant: kimono.variantId,
    price: 30_000,
    qty: 1,
    created: "2026-10-21T10:00:00-05:00",
    cancelled: true,
  });
  await pay(C.id, 30_000);

  // Stock: 5 counted 70 days ago (slow mover), 2 written off this week, 1 sold today
  const item = { clothPieceVariantId: bata.variantId, sizeId: size!.id, colorId: null };
  await db.insert(s.stockMovements).values({
    ...item,
    quantity: 5,
    kind: "adjustment",
    reason: "Conteo inicial",
    createdBy: admin.id,
    createdAt: new Date(NOW.getTime() - 70 * 86_400_000),
  });
  await db.insert(s.stockMovements).values({
    ...item,
    quantity: -2,
    kind: "adjustment",
    reason: "Prenda dañada",
    createdBy: admin.id,
    createdAt: new Date("2026-10-23T10:00:00-05:00"),
  });
  const [sale] = await db
    .insert(s.clothSales)
    .values({
      businessDayId: day,
      clothPieceId: bata.pieceId,
      clothPieceVariantId: bata.variantId,
      sizeId: size!.id,
      quantity: 1,
      unitPrice: 50_000,
      soldBy: admin.id,
      paymentMethod: "cash",
    })
    .returning();
  await db.insert(s.stockMovements).values({
    ...item,
    quantity: -1,
    kind: "sale",
    refType: "cloth_sale",
    refId: sale!.id,
    createdBy: admin.id,
    createdAt: new Date("2026-10-24T12:00:00-05:00"),
  });
  return { day, A, luz, ana, bata };
}

describeDb("Analítica (T133)", () => {
  it("pedidos: receivables, saldo a favor, overdue, on-time and lead time", () =>
    withCleanDb(async (db) => {
      const { A } = await scenario(db);
      const now = await pedidoFiguresNow(db, "2026-10-25", NOW);
      expect(now.receivables.map((r) => [r.id, r.balance])).toEqual([[A.id, 300_000]]);
      expect(now.receivablesTotal).toBe(300_000);
      expect(now.saldoAFavorTotal).toBe(40_000); // B $10.000 + cancelled C $30.000
      expect(now.saldoAFavorCount).toBe(2);
      expect(now.overdue.map((o) => o.id)).toEqual([A.id]);

      const period = await pedidoFiguresForPeriod(db, W);
      expect(period).toEqual({
        created: 1,
        units: 10,
        completed: 1,
        onTime: 0,
        withPromise: 1,
        avgLeadDays: 5,
      });

      // Reconcile: receivables + payments = totals of open client pedidos
      const [{ open }] = (
        await db.execute(
          sql`SELECT coalesce(sum(amount), 0)::bigint AS open FROM pedido_payments pp JOIN pedidos p ON p.id = pp.pedido_id WHERE p.cancelled_at IS NULL AND p.id = ${A.id}`,
        )
      ).rows as { open: string }[];
      expect(now.receivablesTotal + Number(open)).toBe(500_000);
    }));

  it("producción: per clothier, per garment with labour vs price, assignment-to-approval time", () =>
    withCleanDb(async (db) => {
      const { day, luz, bata } = await scenario(db);
      const f = await productionFigures(db, [day]);
      expect(f.byClothier.find((c) => c.employeeId === luz.id)).toMatchObject({
        approved: 8,
        returned: 1,
        scrapped: 1,
        returnRate: 10,
      });
      expect(f.byGarment.find((g) => g.clothPieceVariantId === bata.variantId)).toMatchObject({
        approved: 8,
        labourCost: 64_000, // 8 × $8.000 (scrap not paid)
        price: 400_000, // 8 × $50.000
        margin: 336_000,
      });
      expect(f.avgAssignToApprovalHours).toBe(48);
      expect(await productionFigures(db, [])).toEqual({
        byClothier: [],
        byGarment: [],
        avgAssignToApprovalHours: null,
      });
    }));

  it("inventario: on hand and value from the ledger, sold, slow movers, write-offs", () =>
    withCleanDb(async (db) => {
      const { day } = await scenario(db);
      const now = await inventoryFiguresNow(db, NOW);
      expect(now.unitsOnHand).toBe(2); // 5 − 2 − 1
      expect(now.valueAtPrice).toBe(100_000);
      expect(now.slowMovers).toHaveLength(0); // the sale moved it this week
      const period = await inventoryFiguresForPeriod(db, W, [day]);
      expect(period.unitsSold).toBe(1);
      expect(period.writeOffUnits).toBe(2);
      expect(period.writeOffs[0]).toMatchObject({ quantity: 2, reason: "Prenda dañada" });

      // Untouched for 60+ days → slow mover
      const later = new Date(NOW.getTime() + 61 * 86_400_000);
      expect((await inventoryFiguresNow(db, later)).slowMovers).toHaveLength(1);
    }));
});
