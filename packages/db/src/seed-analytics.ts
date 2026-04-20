/**
 * T101 — Analytics seed script
 *
 * ⚠️  DESTRUCTIVE — clears ALL rows from: business_days, tickets, ticket_items,
 * ticket_payments, checkout_sessions, cloth_batches, batch_pieces, payouts,
 * payout_period_days, payout_ticket_items, payout_batch_pieces,
 * employee_absences, large_orders, large_order_payments, clients.
 *
 * This script is intended for development / staging databases only.
 * Do NOT run against a production database. Real data will be lost.
 *
 * Two safeguards must both be present:
 *   --analytics          (flag 1 — confirms intent)
 *   --confirm-destructive (flag 2 — confirms you read this warning)
 *
 * Run: pnpm --filter @befine/db db:seed:analytics
 * (package.json script passes both flags automatically — still read this)
 */

import { eq } from "drizzle-orm";
import { createDb } from "./index";
import {
  users,
  employees,
  businessDays,
  serviceVariants,
  clothPieces,
  clients,
  tickets,
  ticketItems,
  ticketPayments,
  checkoutSessions,
  clothBatches,
  batchPieces,
  payouts,
  payoutPeriodDays,
  payoutTicketItems,
  payoutBatchPieces,
  employeeAbsences,
  largeOrders,
  largeOrderPayments,
} from "./schema";

// ─── Guard ────────────────────────────────────────────────────────────────────

if (!process.argv.includes("--analytics") || !process.argv.includes("--confirm-destructive")) {
  console.error("❌  SAFETY GUARD: This script deletes ALL analytics data.");
  console.error("    Pass BOTH flags to proceed:");
  console.error("      --analytics --confirm-destructive");
  console.error("    Do NOT run against a production database.");
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const db = createDb(DATABASE_URL);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function bogotaDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** Realistic daily revenue target — weekdays higher than Saturdays */
function dailyRevenueTarget(dow: number): number {
  if (dow === 0) return 0; // Sunday closed
  if (dow === 6) return randomInt(400_000, 700_000); // Saturday lighter
  return randomInt(800_000, 1_800_000); // Mon–Fri
}

// ─── Clear analytics data ─────────────────────────────────────────────────────

async function clearAnalyticsData() {
  console.log("🗑️  Clearing analytics seed data...");

  // Delete in reverse FK order — all tables that reference business_days or tickets
  await db.delete(payoutBatchPieces);
  await db.delete(payoutTicketItems);
  await db.delete(payoutPeriodDays);
  await db.delete(payouts);
  await db.delete(batchPieces);
  await db.delete(clothBatches);
  await db.delete(ticketPayments);
  await db.delete(ticketItems);
  await db.delete(tickets);
  await db.delete(checkoutSessions);
  await db.delete(employeeAbsences);
  await db.delete(largeOrderPayments);
  await db.delete(largeOrders);
  await db.delete(businessDays);
  await db.delete(clients);

  console.log("✅ Analytics data cleared");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("🌱 Starting analytics seed (6 months of data)...");

  // Load employees
  const empRows = await db
    .select({
      id: employees.id,
      role: employees.role,
      userId: employees.userId,
      dailyRate: employees.dailyRate,
      expectedWorkDays: employees.expectedWorkDays,
    })
    .from(employees);

  if (empRows.length === 0) {
    console.error("❌ No employees found. Run db:seed first.");
    process.exit(1);
  }

  // Load catalog
  const variantRows = await db
    .select({
      id: serviceVariants.id,
      customerPrice: serviceVariants.customerPrice,
      commissionPct: serviceVariants.commissionPct,
    })
    .from(serviceVariants)
    .where(eq(serviceVariants.isActive, true));

  const pieceRows = await db
    .select({ id: clothPieces.id, pieceRate: clothPieces.pieceRate })
    .from(clothPieces)
    .where(eq(clothPieces.isActive, true));

  // Find admin user
  const adminEmp = empRows.find((e) => e.role === "cashier_admin");
  const stylistEmps = empRows.filter((e) => e.role === "stylist");
  const clothierEmps = empRows.filter((e) => e.role === "clothier");
  const secretaryEmps = empRows.filter((e) => e.role === "secretary");

  if (!adminEmp) {
    console.error("❌ No cashier_admin employee found");
    process.exit(1);
  }

  await clearAnalyticsData();

  // Seed clients
  console.log("👥 Seeding clients...");
  const clientIds: string[] = [];
  for (let i = 0; i < 40; i++) {
    const [client] = await db
      .insert(clients)
      .values({
        name: `Cliente Seed ${i + 1}`,
        phone: `300${String(i).padStart(7, "0")}`,
        noShowCount: 0,
      })
      .returning({ id: clients.id });
    clientIds.push(client.id);
  }

  // Generate 6 months of business days starting 6 months ago
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  startDate.setDate(1);

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // up to yesterday

  let currentDate = new Date(startDate);
  let dayCount = 0;
  let ticketCount = 0;
  const seedDayIds: string[] = [];

  while (currentDate <= endDate) {
    const dow = currentDate.getDay();

    // Skip Sundays
    if (dow === 0) {
      currentDate = addDays(currentDate, 1);
      continue;
    }

    const dateStr = bogotaDateStr(currentDate);
    const openedAt = new Date(dateStr + "T08:00:00-05:00");
    const closedAt = new Date(dateStr + "T19:00:00-05:00");

    // Find admin userId
    const adminUserRow = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, adminEmp.userId))
      .limit(1);

    const [day] = await db
      .insert(businessDays)
      .values({
        openedAt,
        closedAt,
        openedBy: adminUserRow[0]?.id ?? adminEmp.userId,
        closedBy: adminUserRow[0]?.id ?? adminEmp.userId,
      })
      .returning({ id: businessDays.id });

    seedDayIds.push(day.id);

    const revenueTarget = dailyRevenueTarget(dow);
    let dayRevenue = 0;

    // Seed stylist tickets
    for (const stylist of stylistEmps) {
      if (variantRows.length === 0) continue;

      // 0–3 tickets per stylist per day (Saturdays fewer)
      const ticketCount2 = dow === 6 ? randomInt(0, 2) : randomInt(1, 4);

      for (let t = 0; t < ticketCount2 && dayRevenue < revenueTarget; t++) {
        const client = clientIds[randomInt(0, clientIds.length - 1)];
        const [ticket] = await db
          .insert(tickets)
          .values({
            businessDayId: day.id,
            employeeId: stylist.id,
            clientId: client,
            status: "closed",
            closedAt: new Date(
              dateStr + "T" + String(randomInt(9, 18)).padStart(2, "0") + ":00:00-05:00",
            ),
            closedBy: adminEmp.id,
            createdBy: adminEmp.id,
            needsReview: false,
          })
          .returning({ id: tickets.id });

        // 1–3 services per ticket
        const numItems = randomInt(1, 3);
        for (let i = 0; i < numItems; i++) {
          const variant = variantRows[randomInt(0, variantRows.length - 1)];
          const qty = randomInt(1, 2);
          dayRevenue += variant.customerPrice * qty;
          await db.insert(ticketItems).values({
            ticketId: ticket.id,
            serviceVariantId: variant.id,
            quantity: qty,
            unitPrice: variant.customerPrice,
            commissionPct: variant.commissionPct,
          });
        }

        ticketCount++;
      }
    }

    // Seed cloth batches + pieces for clothiers
    if (clothierEmps.length > 0 && pieceRows.length > 0) {
      const [batch] = await db
        .insert(clothBatches)
        .values({ businessDayId: day.id, createdBy: adminEmp.id })
        .returning({ id: clothBatches.id });

      for (const clothier of clothierEmps) {
        const numPieces = dow === 6 ? randomInt(1, 3) : randomInt(2, 6);
        for (let p = 0; p < numPieces; p++) {
          const piece = pieceRows[randomInt(0, pieceRows.length - 1)];
          await db.insert(batchPieces).values({
            batchId: batch.id,
            clothPieceId: piece.id,
            assignedToEmployeeId: clothier.id,
            claimSource: "assigned",
            claimedAt: openedAt,
            status: "approved",
            completedAt: closedAt,
            approvedAt: closedAt,
            approvedBy: adminEmp.id,
          });
        }
      }
    }

    // Secretary absences — ~1 vacation day per month per secretary
    for (const sec of secretaryEmps) {
      if (randomInt(1, 20) === 1) {
        // ~5% chance per day = ~1/month
        await db
          .insert(employeeAbsences)
          .values({
            employeeId: sec.id,
            date: dateStr,
            type: "vacation",
            createdBy: adminEmp.id,
          })
          .onConflictDoNothing();
      }
    }

    dayCount++;
    if (dayCount % 30 === 0) {
      console.log(`  ✓ ${dayCount} days seeded, ${ticketCount} tickets created`);
    }

    currentDate = addDays(currentDate, 1);
  }

  console.log(`\n✅ Analytics seed complete:`);
  console.log(`   ${dayCount} business days`);
  console.log(`   ${ticketCount} tickets`);
  console.log(`   ${clientIds.length} clients`);
  console.log(`\nRun the analytics queries to verify results.`);
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
