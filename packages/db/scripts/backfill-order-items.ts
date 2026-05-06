/**
 * One-time backfill: create order_items rows from existing large-order craftables.
 *
 * For each large order with linked craftables (source = 'large_order'), groups
 * craftable_pieces by (cloth_piece_id, cloth_piece_variant_id), sums quantity,
 * and inserts one order_items row per group.
 *
 * Run with:
 *   npx tsx packages/db/scripts/backfill-order-items.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import { largeOrders, craftables, craftablePieces, clothPieces, orderItems } from "../src/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Fetch all large orders that have at least one large_order craftable
  const linkedCraftables = await db
    .select({
      id: craftables.id,
      largeOrderId: craftables.largeOrderId,
    })
    .from(craftables)
    .where(eq(craftables.source, "large_order"));

  const largeOrderIdSet = new Set(
    linkedCraftables.map((c) => c.largeOrderId).filter(Boolean) as string[],
  );

  if (largeOrderIdSet.size === 0) {
    console.log("No large-order-linked craftables found. Nothing to backfill.");
    return;
  }

  const largeOrderIds = [...largeOrderIdSet];
  const allOrders = await db
    .select({ id: largeOrders.id })
    .from(largeOrders)
    .where(inArray(largeOrders.id, largeOrderIds));

  let processed = 0;
  let unresolved = 0;

  for (const order of allOrders) {
    // Get all craftable_pieces for this large order
    const orderCraftableIds = linkedCraftables
      .filter((c) => c.largeOrderId === order.id)
      .map((c) => c.id);

    if (orderCraftableIds.length === 0) {
      console.log(`[UNRESOLVED] largeOrderId=${order.id} — no craftables found`);
      unresolved++;
      continue;
    }

    const pieces = await db
      .select({
        clothPieceId: craftablePieces.clothPieceId,
        clothPieceVariantId: craftablePieces.clothPieceVariantId,
        pieceName: clothPieces.name,
        quantity: craftablePieces.quantity,
      })
      .from(craftablePieces)
      .innerJoin(clothPieces, eq(craftablePieces.clothPieceId, clothPieces.id))
      .where(inArray(craftablePieces.craftableId, orderCraftableIds));

    if (pieces.length === 0) {
      console.log(`[UNRESOLVED] largeOrderId=${order.id} — zero craftable pieces`);
      unresolved++;
      continue;
    }

    // Group by (clothPieceId, clothPieceVariantId) and sum quantity
    const groupMap = new Map<
      string,
      { clothPieceId: string; clothPieceVariantId: string; pieceName: string; quantity: number }
    >();
    for (const piece of pieces) {
      const key = `${piece.clothPieceId}:${piece.clothPieceVariantId}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.quantity += piece.quantity;
      } else {
        groupMap.set(key, { ...piece });
      }
    }

    const itemsToInsert = [...groupMap.values()];

    // Check if order_items already exist for this large order (idempotency)
    const existing = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.largeOrderId, order.id));

    if (existing.length > 0) {
      console.log(
        `[SKIP] largeOrderId=${order.id} — already has ${existing.length} order_items row(s)`,
      );
      processed++;
      continue;
    }

    // Insert inside a transaction — roll back all rows for this order on failure
    await db.transaction(async (tx) => {
      for (const item of itemsToInsert) {
        await tx.insert(orderItems).values({
          largeOrderId: order.id,
          clothPieceId: item.clothPieceId,
          clothPieceVariantId: item.clothPieceVariantId,
          pieceName: item.pieceName,
          quantity: item.quantity,
        });
      }
    });

    console.log(
      `[OK] largeOrderId=${order.id} — inserted ${itemsToInsert.length} order_items row(s)`,
    );
    processed++;
  }

  console.log(`\nDone. Processed: ${processed}, Unresolved: ${unresolved}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
