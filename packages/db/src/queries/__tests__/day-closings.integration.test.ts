import { it, expect } from "vitest";
import * as s from "../../schema";
import { getClosingLines, getDayClosings } from "../day-closings";
import {
  describeDb,
  makeClothVariant,
  makeDay,
  makeEmployee,
  withCleanDb,
} from "./helpers/test-db";

// T125 — what a clothier closes her day on, and who still has to close.

describeDb("day closings", () => {
  it("lists held work and today's reports, and who has not closed", () =>
    withCleanDb(async (db) => {
      const admin = await makeEmployee(db, { role: "admin" });
      const luz = await makeEmployee(db, { role: "clothier", name: "Luz" });
      const ana = await makeEmployee(db, { role: "clothier", name: "Ana" });
      const idle = await makeEmployee(db, { role: "clothier", name: "Sin trabajo" });
      void idle;
      const yesterday = await makeDay(db, "2026-10-23T13:00:00Z", { openedBy: admin.userId });
      const today = await makeDay(db, "2026-10-24T13:00:00Z", {
        open: true,
        openedBy: admin.userId,
      });
      const bata = await makeClothVariant(db, { name: "Bata" });
      const [m] = await db.insert(s.garmentSizes).values({ label: "M", sortOrder: 2 }).returning();
      const [sz] = await db.insert(s.garmentSizes).values({ label: "S", sortOrder: 1 }).returning();
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
      const cells = await db
        .insert(s.pedidoLineCells)
        .values([
          { lineId: l!.id, sizeId: m!.id, quantity: 10 },
          { lineId: l!.id, sizeId: sz!.id, quantity: 10 },
        ])
        .returning();
      const assign = async (cellId: string, employeeId: string, quantity: number) =>
        (
          await db
            .insert(s.assignments)
            .values({
              cellId,
              employeeId,
              quantity,
              pieceRate: 8_000,
              source: "assigned",
              createdBy: admin.id,
            })
            .returning()
        )[0]!.id;

      // Luz: M fully done yesterday; S 4 held, 3 reported today.
      const done = await assign(cells[0]!.id, luz.id, 2);
      await db.insert(s.unitReports).values({
        assignmentId: done,
        quantity: 2,
        businessDayId: yesterday,
        reportedBy: luz.id,
      });
      const holding = await assign(cells[1]!.id, luz.id, 4);
      await db.insert(s.unitReports).values({
        assignmentId: holding,
        quantity: 3,
        businessDayId: today,
        reportedBy: luz.id,
      });
      // Ana holds work but closed already.
      await assign(cells[0]!.id, ana.id, 3);
      await db.insert(s.clothierDayClosings).values({
        employeeId: ana.id,
        businessDayId: today,
        submittedUnits: 0,
        lines: [],
      });

      const lines = await getClosingLines(db, luz.id, today);
      expect(lines).toEqual([
        expect.objectContaining({
          assignmentId: holding,
          size: "S",
          reportedToday: 3,
          toDo: 1,
          pendingReview: 3,
        }),
      ]);

      const status = await getDayClosings(db, today);
      expect(status.map((x) => [x.name, x.closing === null])).toEqual([
        ["Luz", true],
        ["Ana", false],
      ]);
      expect(status[1]!.closing).toMatchObject({ submittedUnits: 0, approvedAt: null, lines: [] });
    }));
});
