import { it, expect } from "vitest";
import * as s from "../../schema";
import { getReviewQueue } from "../production-review";
import { listUnassignedCells } from "../clothier-work";
import {
  describeDb,
  makeClothVariant,
  makeDay,
  makeEmployee,
  withCleanDb,
} from "./helpers/test-db";

// T124 — reported units waiting for review, grouped by clothier.

describeDb("getReviewQueue", () => {
  it("groups pending units by clothier and flags re-reported corrections", () =>
    withCleanDb(async (db) => {
      const admin = await makeEmployee(db, { role: "admin" });
      const luz = await makeEmployee(db, { role: "clothier", name: "Luz" });
      const ana = await makeEmployee(db, { role: "clothier", name: "Ana" });
      const day = await makeDay(db, "2026-10-24T13:00:00Z", { open: true, openedBy: admin.userId });
      const bata = await makeClothVariant(db, { name: "Bata" });
      const [size] = await db.insert(s.garmentSizes).values({ label: "M" }).returning();
      const [p] = await db
        .insert(s.pedidos)
        .values({ destination: "inventory", createdBy: admin.id })
        .returning();
      const [l] = await db
        .insert(s.pedidoLines)
        .values({
          pedidoId: p!.id,
          kind: "garment",
          clothPieceVariantId: bata.variantId,
          unitPrice: 1,
        })
        .returning();
      const [c] = await db
        .insert(s.pedidoLineCells)
        .values({ lineId: l!.id, sizeId: size!.id, quantity: 20 })
        .returning();
      const assign = async (employeeId: string, quantity: number) =>
        (
          await db
            .insert(s.assignments)
            .values({
              cellId: c!.id,
              employeeId,
              quantity,
              pieceRate: 8_000,
              source: "assigned",
              createdBy: admin.id,
            })
            .returning()
        )[0]!.id;
      const report = (
        assignmentId: string,
        quantity: number,
        reportedBy: string,
        kind: "report" | "rework" = "report",
      ) =>
        db
          .insert(s.unitReports)
          .values({ assignmentId, quantity, kind, businessDayId: day, reportedBy });

      const aLuz = await assign(luz.id, 8);
      await report(aLuz, 6, luz.id);
      await db.insert(s.unitReviews).values({
        assignmentId: aLuz,
        approved: 4,
        returned: 2,
        reason: "costura",
        businessDayId: day,
        reviewedBy: admin.id,
      });
      await report(aLuz, 2, luz.id, "rework");
      await report(aLuz, 1, luz.id);

      const aAna = await assign(ana.id, 5);
      await report(aAna, 5, ana.id);
      const done = await assign(ana.id, 0); // nothing reported: not in the queue
      void done;

      const queue = await getReviewQueue(db);
      expect(queue.map((g) => [g.clothierName, g.pending])).toEqual([
        ["Ana", 5],
        ["Luz", 3],
      ]);
      expect(queue[1]!.items[0]).toMatchObject({
        assignmentId: aLuz,
        pending: 3,
        includesRework: true,
        sizeLabel: "M",
        destination: "inventory",
      });
      expect(queue[0]!.items[0]!.includesRework).toBe(false);

      // Fully reviewed assignments drop out.
      await db.insert(s.unitReviews).values({
        assignmentId: aAna,
        approved: 5,
        businessDayId: day,
        reviewedBy: admin.id,
      });
      expect((await getReviewQueue(db)).map((g) => g.clothierName)).toEqual(["Luz"]);

      const free = await listUnassignedCells(db, "2026-10-24");
      expect(free).toEqual([
        expect.objectContaining({ cellId: c!.id, pedidoId: p!.id, unassigned: 7 }),
      ]);
    }));
});
