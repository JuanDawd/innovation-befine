/**
 * One-time backfill: create cloth_piece_assignments from existing craftable_pieces
 * that are linked to large orders.
 *
 * Run with:
 *   npx tsx packages/db/scripts/backfill-assignments.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import { craftables, craftablePieces, orderItems, clothPieceAssignments } from "../src/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Fetch all craftable_pieces linked to large orders
  const linkedCraftables = await db
    .select({ id: craftables.id, largeOrderId: craftables.largeOrderId })
    .from(craftables)
    .where(eq(craftables.source, "large_order"));

  if (linkedCraftables.length === 0) {
    console.log("No large-order craftables found. Nothing to backfill.");
    return;
  }

  const craftableIds = linkedCraftables.map((c) => c.id);
  const craftableToOrderId = new Map(linkedCraftables.map((c) => [c.id, c.largeOrderId as string]));

  const pieces = await db
    .select({
      id: craftablePieces.id,
      craftableId: craftablePieces.craftableId,
      clothPieceId: craftablePieces.clothPieceId,
      clothPieceVariantId: craftablePieces.clothPieceVariantId,
      assignedToEmployeeId: craftablePieces.assignedToEmployeeId,
      status: craftablePieces.status,
      quantity: craftablePieces.quantity,
    })
    .from(craftablePieces)
    .where(inArray(craftablePieces.craftableId, craftableIds));

  if (pieces.length === 0) {
    console.log("No craftable pieces found for large-order craftables.");
    return;
  }

  // Fetch all order_items that could match (grouped by large order)
  const largeOrderIds = [...new Set(linkedCraftables.map((c) => c.largeOrderId as string))];
  const allOrderItems = await db
    .select({
      id: orderItems.id,
      largeOrderId: orderItems.largeOrderId,
      clothPieceId: orderItems.clothPieceId,
      clothPieceVariantId: orderItems.clothPieceVariantId,
    })
    .from(orderItems)
    .where(inArray(orderItems.largeOrderId, largeOrderIds));

  // Check which craftable_pieces already have assignments (idempotency)
  const existingAssignments = await db
    .select({ craftablePieceId: clothPieceAssignments.craftablePieceId })
    .from(clothPieceAssignments)
    .where(
      inArray(
        clothPieceAssignments.craftablePieceId,
        pieces.map((p) => p.id),
      ),
    );

  const alreadyBackfilled = new Set(existingAssignments.map((a) => a.craftablePieceId));

  // Build order_items lookup: largeOrderId → Map(clothPieceId:variantId → orderItemId)
  const itemLookup = new Map<string, Map<string, string>>();
  for (const item of allOrderItems) {
    if (!itemLookup.has(item.largeOrderId)) itemLookup.set(item.largeOrderId, new Map());
    const key = `${item.clothPieceId}:${item.clothPieceVariantId}`;
    itemLookup.get(item.largeOrderId)!.set(key, item.id);
  }

  let inserted = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const piece of pieces) {
    if (alreadyBackfilled.has(piece.id)) {
      skipped++;
      continue;
    }

    const largeOrderId = craftableToOrderId.get(piece.craftableId);
    if (!largeOrderId) {
      console.log(`[UNMATCHED] craftablePieceId=${piece.id} — no largeOrderId found`);
      unmatched++;
      continue;
    }

    const key = `${piece.clothPieceId}:${piece.clothPieceVariantId}`;
    const orderItemId = itemLookup.get(largeOrderId)?.get(key);
    if (!orderItemId) {
      console.log(
        `[UNMATCHED] craftablePieceId=${piece.id} largeOrderId=${largeOrderId} — no matching order_items row for piece ${key}`,
      );
      unmatched++;
      continue;
    }

    if (!piece.assignedToEmployeeId) {
      console.log(
        `[SKIP] craftablePieceId=${piece.id} — no assignedToEmployeeId (unassigned piece)`,
      );
      skipped++;
      continue;
    }

    const completedQuantity = piece.status !== "pending" ? piece.quantity : 0;
    const approvedQuantity = piece.status === "approved" ? piece.quantity : 0;

    await db.insert(clothPieceAssignments).values({
      orderItemId,
      craftablePieceId: piece.id,
      assigneeId: piece.assignedToEmployeeId,
      assignedQuantity: piece.quantity,
      completedQuantity,
      approvedQuantity,
    });

    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}, Unmatched: ${unmatched}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
