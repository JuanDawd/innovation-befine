import { it, expect } from "vitest";
import { sql } from "drizzle-orm";
import * as s from "../../schema";
import { resetTestData } from "../../reset-test-data";
import {
  describeDb,
  makeClothVariant,
  makeDay,
  makeEmployee,
  makeTicket,
  makeVariant,
  withCleanDb,
} from "./helpers/test-db";

// T135 — the reset empties operational data, keeps the setup, and is idempotent.
// Runs inside the rolled-back test transaction: nothing is really wiped.

const count = async (db: Parameters<Parameters<typeof withCleanDb>[0]>[0], table: string) =>
  Number((await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`))).rows[0]!.n);

describeDb("resetTestData", () => {
  it("empties operational tables, keeps catalog, employees and settings, twice", () =>
    withCleanDb(async (db) => {
      const stylist = await makeEmployee(db, { name: "Ana" });
      const day = await makeDay(db, "2026-10-24T13:00:00Z", {
        open: true,
        openedBy: stylist.userId,
      });
      const v = await makeVariant(db);
      await makeTicket(db, { dayId: day, employeeId: stylist.id, variantId: v });
      await makeClothVariant(db);
      await db.insert(s.clients).values({ name: "Laura", phone: "3000000000" });
      await db.insert(s.pedidos).values({ destination: "inventory", createdBy: stylist.id });

      const first = await resetTestData(db);
      expect(first).toEqual(
        expect.arrayContaining(["tickets", "business_days", "clients", "pedidos", "activity_log"]),
      );
      for (const t of ["tickets", "ticket_items", "business_days", "clients", "pedidos"])
        expect(await count(db, t), t).toBe(0);
      for (const t of [
        "users",
        "employees",
        "services",
        "service_variants",
        "cloth_pieces",
        "cloth_piece_variants",
      ])
        expect(await count(db, t), t).toBeGreaterThan(0);

      // Idempotent, and pedido numbering starts again at 1.
      expect(await resetTestData(db)).toEqual(first);
      const [p] = await db
        .insert(s.pedidos)
        .values({ destination: "inventory", createdBy: stylist.id })
        .returning();
      expect(p!.number).toBe(1);
    }));
});
