import { it, expect, vi } from "vitest";
import {
  getAssignmentProgress,
  getOrderItemsWithProgress,
  getUnassignedQuantity,
} from "../order-items";
import { getProductDetail, getProductsDashboard } from "../products";
import {
  describeDb,
  makeAssignment,
  makeClothVariant,
  makeDay,
  makeEmployee,
  makeLargeOrder,
  makeProduct,
  withCleanDb,
} from "./helpers/test-db";

// M-70b — large-order assignment progress and the products dashboard against
// a real Postgres.

async function orderWithPiece(db: Parameters<Parameters<typeof withCleanDb>[0]>[0], qty: number) {
  const admin = await makeEmployee(db, { role: "admin" });
  const day = await makeDay(db, "2026-10-22T13:00:00Z");
  const bata = await makeClothVariant(db);
  const order = await makeLargeOrder(db, {
    createdBy: admin.id,
    clientName: "Hotel Caribe",
    items: [{ cloth: bata, quantity: qty }],
  });
  const product = await makeProduct(db, {
    dayId: day,
    createdBy: admin.id,
    largeOrderId: order.orderId,
    source: "large_order",
    pieces: [{ cloth: bata, quantity: qty }],
  });
  return { admin, day, bata, order, itemId: order.itemIds[0]!, pieceId: product.pieceIds[0]! };
}

describeDb("getUnassignedQuantity", () => {
  it("is the item quantity minus every assignment", () =>
    withCleanDb(async (db) => {
      const { itemId, pieceId } = await orderWithPiece(db, 10);
      const a = await makeEmployee(db, { role: "clothier" });
      const b = await makeEmployee(db, { role: "clothier" });
      expect(await getUnassignedQuantity(db, itemId)).toBe(10);
      await makeAssignment(db, {
        orderItemId: itemId,
        productPieceId: pieceId,
        assigneeId: a.id,
        assigned: 4,
      });
      await makeAssignment(db, {
        orderItemId: itemId,
        productPieceId: pieceId,
        assigneeId: b.id,
        assigned: 6,
      });
      expect(await getUnassignedQuantity(db, itemId)).toBe(0);
    }));

  it("never goes negative on over-assignment (logged as an anomaly)", () =>
    withCleanDb(async (db) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { itemId, pieceId } = await orderWithPiece(db, 3);
      const a = await makeEmployee(db, { role: "clothier" });
      await makeAssignment(db, {
        orderItemId: itemId,
        productPieceId: pieceId,
        assigneeId: a.id,
        assigned: 5,
      });
      expect(await getUnassignedQuantity(db, itemId)).toBe(0);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    }));

  it("is 0 for an unknown item", () =>
    withCleanDb(async (db) => {
      expect(await getUnassignedQuantity(db, crypto.randomUUID())).toBe(0);
    }));
});

describeDb("getAssignmentProgress", () => {
  it("one row per assignee plus an unassigned remainder; progress is approved / item quantity", () =>
    withCleanDb(async (db) => {
      const { itemId, pieceId } = await orderWithPiece(db, 10);
      const ana = await makeEmployee(db, { name: "Ana", role: "clothier" });
      await makeAssignment(db, {
        orderItemId: itemId,
        productPieceId: pieceId,
        assigneeId: ana.id,
        assigned: 6,
        completed: 5,
        approved: 3,
      });

      const rows = await getAssignmentProgress(db, itemId);
      expect(rows).toEqual([
        expect.objectContaining({
          assigneeId: ana.id,
          assigneeName: "Ana",
          assignedQuantity: 6,
          completedQuantity: 5,
          approvedQuantity: 3,
          progressPct: 30,
          dataAnomaly: false,
        }),
        {
          assignmentId: null,
          assigneeId: null,
          assigneeName: null,
          assignedQuantity: 4,
          completedQuantity: 0,
          approvedQuantity: 0,
          progressPct: 0,
          dataAnomaly: false,
          version: 0,
        },
      ]);
    }));

  it("flags over-assignment and adds no remainder row", () =>
    withCleanDb(async (db) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { itemId, pieceId } = await orderWithPiece(db, 2);
      const a = await makeEmployee(db, { role: "clothier" });
      await makeAssignment(db, {
        orderItemId: itemId,
        productPieceId: pieceId,
        assigneeId: a.id,
        assigned: 3,
      });
      const rows = await getAssignmentProgress(db, itemId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.dataAnomaly).toBe(true);
      warn.mockRestore();
    }));

  it("is empty for an unknown item", () =>
    withCleanDb(async (db) => {
      expect(await getAssignmentProgress(db, crypto.randomUUID())).toEqual([]);
    }));
});

describeDb("getOrderItemsWithProgress", () => {
  it("returns each item of the order with its assignment progress", () =>
    withCleanDb(async (db) => {
      const { order, itemId } = await orderWithPiece(db, 5);
      const items = await getOrderItemsWithProgress(db, order.orderId);
      expect(items).toEqual([
        expect.objectContaining({
          id: itemId,
          largeOrderId: order.orderId,
          pieceName: "Bata",
          quantity: 5,
          assignments: [expect.objectContaining({ assigneeId: null, assignedQuantity: 5 })],
        }),
      ]);
      expect(await getOrderItemsWithProgress(db, crypto.randomUUID())).toEqual([]);
    }));
});

describeDb("getProductsDashboard", () => {
  it("today's products and past-day WIP; fully approved past products drop out", () =>
    withCleanDb(async (db) => {
      const admin = await makeEmployee(db, { role: "admin" });
      const ana = await makeEmployee(db, { name: "Ana", role: "clothier" });
      const bata = await makeClothVariant(db);
      const monday = await makeDay(db, "2026-10-19T13:00:00Z");
      const tuesday = await makeDay(db, "2026-10-20T13:00:00Z");
      const today = await makeDay(db, "2026-10-23T13:00:00Z", { open: true });

      const wipOld = await makeProduct(db, {
        dayId: monday,
        createdBy: admin.id,
        pieces: [
          { cloth: bata, status: "approved", quantity: 1 },
          { cloth: bata, status: "pending", quantity: 3, assignedTo: ana.id },
        ],
      });
      const wipNewer = await makeProduct(db, {
        dayId: tuesday,
        createdBy: admin.id,
        pieces: [{ cloth: bata, status: "done_pending_approval" }],
      });
      await makeProduct(db, {
        dayId: tuesday,
        createdBy: admin.id,
        pieces: [{ cloth: bata, status: "approved" }], // done → hidden
      });
      await makeProduct(db, { dayId: monday, createdBy: admin.id, pieces: [] }); // empty → hidden
      const todays = await makeProduct(db, {
        dayId: today,
        createdBy: admin.id,
        pieces: [{ cloth: bata, status: "approved", quantity: 2 }],
      });

      const rows = await getProductsDashboard(db);
      expect(rows.map((r) => [r.id, r.section])).toEqual([
        [wipOld.productId, "wip"],
        [wipNewer.productId, "wip"],
        [todays.productId, "today"],
      ]);
      // Quantity-weighted: 1 approved of 4 garments
      expect(rows[0]).toEqual(
        expect.objectContaining({
          totalPieces: 4,
          approvedPieces: 1,
          pendingPieces: 3,
          progressPct: 25,
          assignedEmployeeNames: ["Ana"],
        }),
      );
      expect(rows[2]).toEqual(expect.objectContaining({ totalPieces: 2, progressPct: 100 }));
    }));

  it("large-order products use approved / ordered quantity and report unassigned units", () =>
    withCleanDb(async (db) => {
      const { itemId, pieceId } = await orderWithPiece(db, 10);
      const ana = await makeEmployee(db, { role: "clothier" });
      await makeAssignment(db, {
        orderItemId: itemId,
        productPieceId: pieceId,
        assigneeId: ana.id,
        assigned: 4,
        completed: 4,
        approved: 2,
      });
      const [row] = await getProductsDashboard(db);
      expect(row).toEqual(
        expect.objectContaining({
          source: "large_order",
          largeOrderClientName: "Hotel Caribe",
          progressPct: 20,
          unassignedQuantity: 6,
          section: "wip",
        }),
      );
    }));

  it("is empty when there are no products", () =>
    withCleanDb(async (db) => {
      expect(await getProductsDashboard(db)).toEqual([]);
    }));
});

describeDb("getProductDetail", () => {
  it("returns the product with its pieces and assignees", () =>
    withCleanDb(async (db) => {
      const { order, pieceId } = await orderWithPiece(db, 3);
      const products = await getProductsDashboard(db);
      const detail = await getProductDetail(db, products[0]!.id);
      expect(detail).toEqual(
        expect.objectContaining({
          largeOrderId: order.orderId,
          largeOrderClientName: "Hotel Caribe",
          pieces: [
            expect.objectContaining({
              id: pieceId,
              clothPieceVariantName: "Estándar",
              assignedEmployeeName: null,
              status: "pending",
              quantity: 3,
            }),
          ],
        }),
      );
    }));

  it("returns null for an unknown product", () =>
    withCleanDb(async (db) => {
      expect(await getProductDetail(db, crypto.randomUUID())).toBeNull();
    }));
});
