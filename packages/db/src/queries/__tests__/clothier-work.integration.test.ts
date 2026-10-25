import { it, expect } from "vitest";
import * as s from "../../schema";
import { getClothierWork } from "../clothier-work";
import {
  describeDb,
  makeClothVariant,
  makeDay,
  makeEmployee,
  withCleanDb,
} from "./helpers/test-db";

// T123 — Mi trabajo: corrections first, then her work by delivery date, then
// claimable sizes (client pedidos before inventory). Her rate only.

type Db = Parameters<Parameters<typeof withCleanDb>[0]>[0];

async function setup(db: Db) {
  const admin = await makeEmployee(db, { role: "admin" });
  const luz = await makeEmployee(db, { role: "clothier", name: "Luz" });
  const marta = await makeEmployee(db, { role: "clothier", name: "Marta" });
  const day = await makeDay(db, "2026-10-24T13:00:00Z", { open: true, openedBy: admin.userId });
  const bata = await makeClothVariant(db, { name: "Bata", pieceRate: 9_000, sellingPrice: 58_000 });
  const [sz] = await db.insert(s.garmentSizes).values({ label: "S", sortOrder: 10 }).returning();
  const [mz] = await db.insert(s.garmentSizes).values({ label: "M", sortOrder: 20 }).returning();
  const [client] = await db.insert(s.clients).values({ name: "Ana", phone: "300" }).returning();

  const pedido = async (
    destination: "client" | "inventory",
    delivery: string | null,
    cells: [string, number][],
    cancelled = false,
  ) => {
    const [p] = await db
      .insert(s.pedidos)
      .values({
        destination,
        clientId: destination === "client" ? client!.id : null,
        createdBy: admin.id,
        estimatedDeliveryAt: delivery ? new Date(`${delivery}T00:00:00-05:00`) : null,
        ...(cancelled ? { cancelledAt: new Date(), cancellationReason: "x" } : {}),
      })
      .returning();
    const [l] = await db
      .insert(s.pedidoLines)
      .values({
        pedidoId: p!.id,
        kind: "garment",
        clothPieceVariantId: bata.variantId,
        unitPrice: 58_000,
        instructions: "doble costura",
      })
      .returning();
    const rows = await db
      .insert(s.pedidoLineCells)
      .values(cells.map(([sizeId, quantity]) => ({ lineId: l!.id, sizeId, quantity })))
      .returning();
    return { pedido: p!, cells: rows };
  };
  const assign = async (cellId: string, employeeId: string, quantity: number, rate = 9_000) => {
    const [a] = await db
      .insert(s.assignments)
      .values({
        cellId,
        employeeId,
        quantity,
        pieceRate: rate,
        source: "assigned",
        createdBy: admin.id,
      })
      .returning();
    return a!.id;
  };
  return { admin, luz, marta, day, s: sz!.id, m: mz!.id, pedido, assign };
}

describeDb("getClothierWork", () => {
  it("lists corrections first, then work by delivery date, with her rate only", () =>
    withCleanDb(async (db) => {
      const f = await setup(db);
      const later = await f.pedido("client", "2026-10-30", [[f.s, 4]]);
      const soon = await f.pedido("client", "2026-10-22", [[f.m, 3]]);
      const fixme = await f.pedido("client", null, [[f.s, 5]]);
      await f.assign(later.cells[0]!.id, f.luz.id, 4);
      await f.assign(soon.cells[0]!.id, f.luz.id, 3, 12_000);
      const a3 = await f.assign(fixme.cells[0]!.id, f.luz.id, 5);
      // She reported 5; 3 approved, 2 returned.
      await db
        .insert(s.unitReports)
        .values({ assignmentId: a3, quantity: 5, businessDayId: f.day, reportedBy: f.luz.id });
      await db.insert(s.unitReviews).values({
        assignmentId: a3,
        approved: 3,
        returned: 2,
        reason: "costura torcida",
        businessDayId: f.day,
        reviewedBy: f.admin.id,
      });
      // Someone else's work never shows.
      await f.assign(later.cells[0]!.id, f.marta.id, 0);

      const w = await getClothierWork(db, f.luz.id, "2026-10-24");
      expect(w.corrections).toHaveLength(1);
      expect(w.corrections[0]).toMatchObject({
        toDo: 2,
        returnReason: "costura torcida",
        canRelease: false,
        progress: expect.objectContaining({ inRework: 2, approved: 3 }),
      });
      expect(w.work.map((i) => i.pedidoNumber)).toEqual([soon.pedido.number, later.pedido.number]);
      expect(w.work[0]).toMatchObject({
        pieceRate: 12_000,
        deliveryFlag: "overdue",
        toDo: 3,
        canRelease: true,
        instructions: "doble costura",
        garment: expect.stringMatching(/^Bata/),
      });
      expect(w.held).toBe(7);
      expect(JSON.stringify(w)).not.toContain("58000");
    }));

  it("offers unassigned sizes, client pedidos first, and skips cancelled pedidos", () =>
    withCleanDb(async (db) => {
      const f = await setup(db);
      const inv = await f.pedido("inventory", "2026-10-20", [[f.s, 6]]);
      const client = await f.pedido("client", "2026-11-05", [
        [f.m, 4],
        [f.s, 2],
      ]);
      await f.pedido("client", "2026-10-21", [[f.s, 9]], true);
      // 3 of the inventory size taken, 1 of them scrapped (re-opens).
      const a = await f.assign(inv.cells[0]!.id, f.marta.id, 3);
      await db
        .insert(s.unitReports)
        .values({ assignmentId: a, quantity: 1, businessDayId: f.day, reportedBy: f.marta.id });
      await db.insert(s.unitReviews).values({
        assignmentId: a,
        scrapped: 1,
        reason: "dañada",
        businessDayId: f.day,
        reviewedBy: f.admin.id,
      });

      const w = await getClothierWork(db, f.luz.id, "2026-10-24");
      expect(w.available.map((x) => [x.destination, x.sizeLabel, x.unassigned])).toEqual([
        ["client", "S", 2],
        ["client", "M", 4],
        ["inventory", "S", 4],
      ]);
      expect(w.available[2]).toMatchObject({ pieceRate: 9_000, deliveryFlag: "overdue" });
      expect(w.available.some((x) => x.pedidoNumber === client.pedido.number)).toBe(true);
      expect(w.work).toEqual([]);
      expect(w.held).toBe(0);
    }));
});
