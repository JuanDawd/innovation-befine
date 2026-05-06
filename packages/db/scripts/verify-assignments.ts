/**
 * Post-backfill verification: detect any order_items rows where
 * SUM(cloth_piece_assignments.assigned_quantity) > order_items.quantity.
 *
 * Run with:
 *   npx tsx packages/db/scripts/verify-assignments.ts
 *
 * Exit code 1 if anomalies are found, 0 if clean.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

async function main() {
  const sqlClient = neon(process.env.DATABASE_URL!);
  const db = drizzle(sqlClient);

  // Check 1: assigned_quantity exceeds order_item.quantity
  const overAssigned = await db.execute(sql`
    SELECT
      oi.id              AS order_item_id,
      oi.large_order_id,
      oi.quantity        AS item_quantity,
      SUM(cpa.assigned_quantity) AS total_assigned
    FROM order_items oi
    JOIN cloth_piece_assignments cpa ON cpa.order_item_id = oi.id
    GROUP BY oi.id, oi.large_order_id, oi.quantity
    HAVING SUM(cpa.assigned_quantity) > oi.quantity
    ORDER BY oi.large_order_id, oi.id
  `);

  // Check 2: completed_quantity exceeds assigned_quantity
  const overCompleted = await db.execute(sql`
    SELECT
      id,
      order_item_id,
      assigned_quantity,
      completed_quantity
    FROM cloth_piece_assignments
    WHERE completed_quantity > assigned_quantity
    ORDER BY order_item_id, id
  `);

  // Check 3: approved_quantity exceeds completed_quantity
  const overApproved = await db.execute(sql`
    SELECT
      id,
      order_item_id,
      completed_quantity,
      approved_quantity
    FROM cloth_piece_assignments
    WHERE approved_quantity > completed_quantity
    ORDER BY order_item_id, id
  `);

  let hasAnomalies = false;

  if (overAssigned.rows.length > 0) {
    hasAnomalies = true;
    console.error(
      `\n[ANOMALY] ${overAssigned.rows.length} order_items row(s) are over-assigned (assigned > item quantity):`,
    );
    for (const row of overAssigned.rows) {
      console.error(
        `  order_item_id=${row.order_item_id}  large_order_id=${row.large_order_id}  item_qty=${row.item_quantity}  total_assigned=${row.total_assigned}`,
      );
    }
  }

  if (overCompleted.rows.length > 0) {
    hasAnomalies = true;
    console.error(
      `\n[ANOMALY] ${overCompleted.rows.length} assignment(s) have completed_quantity > assigned_quantity:`,
    );
    for (const row of overCompleted.rows) {
      console.error(
        `  id=${row.id}  order_item_id=${row.order_item_id}  assigned=${row.assigned_quantity}  completed=${row.completed_quantity}`,
      );
    }
  }

  if (overApproved.rows.length > 0) {
    hasAnomalies = true;
    console.error(
      `\n[ANOMALY] ${overApproved.rows.length} assignment(s) have approved_quantity > completed_quantity:`,
    );
    for (const row of overApproved.rows) {
      console.error(
        `  id=${row.id}  order_item_id=${row.order_item_id}  completed=${row.completed_quantity}  approved=${row.approved_quantity}`,
      );
    }
  }

  if (!hasAnomalies) {
    console.log("\n✓ All invariants satisfied — backfill data is clean. Safe to go live.");
    process.exit(0);
  } else {
    console.error("\n✗ Anomalies detected — resolve before enabling Phase 4 production features.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
