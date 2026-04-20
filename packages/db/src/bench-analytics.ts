/**
 * T107 — Analytics query performance benchmark
 *
 * Measures wall-clock latency of each T071 analytics query against the
 * Neon database seeded with 6 months of data (T101).
 *
 * Run: pnpm --filter @befine/db db:bench:analytics
 */

import { createDb } from "./index";
import {
  revenueByPeriod,
  earningsByEmployee,
  dailyRevenueBreakdown,
  getBusinessDayIdsByPeriod,
  employeeDayBreakdown,
} from "./queries/analytics";
import { employees, businessDays } from "./schema/index";
import { not, sql, eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = createDb(DATABASE_URL);

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const ms = (performance.now() - start).toFixed(1);
  const target = label.includes("analytics") ? 200 : 500;
  const status = Number(ms) <= target ? "✅" : "❌ EXCEEDS TARGET";
  console.log(`  ${status} ${label}: ${ms}ms (target <${target}ms)`);
  return result;
}

async function run() {
  console.log("\n🔬 T107 — Analytics query performance benchmark");
  console.log("   Database: Neon (serverless HTTP driver)\n");

  // Get today in Bogota
  const bogotaToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  // Load all closed business day IDs for full-period queries
  const allClosed = await db
    .select({ id: businessDays.id, openedAt: businessDays.openedAt })
    .from(businessDays)
    .where(not(sql`${businessDays.closedAt} IS NULL`));
  const allIds = allClosed.map((d) => d.id);

  console.log(`   Seeded data: ${allIds.length} closed business days\n`);

  // --- Period resolution ---
  console.log("─── Period resolution ───────────────────────────────");
  await time("analytics getBusinessDayIdsByPeriod(day)", () =>
    getBusinessDayIdsByPeriod(db, "day", bogotaToday),
  );
  const { current: weekIds } = await time("analytics getBusinessDayIdsByPeriod(week)", () =>
    getBusinessDayIdsByPeriod(db, "week", bogotaToday),
  );
  const { current: monthIds } = await time("analytics getBusinessDayIdsByPeriod(month)", () =>
    getBusinessDayIdsByPeriod(db, "month", bogotaToday),
  );

  // --- Revenue queries ---
  console.log("\n─── revenueByPeriod ─────────────────────────────────");
  await time("analytics revenueByPeriod(all 172 days)", () => revenueByPeriod(db, allIds));
  await time("analytics revenueByPeriod(week)", () => revenueByPeriod(db, weekIds));
  await time("analytics revenueByPeriod(month)", () => revenueByPeriod(db, monthIds));
  const rev = await revenueByPeriod(db, allIds);
  console.log(
    `     → total revenue: $${rev.totalRevenue.toLocaleString("es-CO")}, jobs: ${rev.totalJobs}`,
  );

  // --- Earnings by employee ---
  console.log("\n─── earningsByEmployee ──────────────────────────────");
  await time("analytics earningsByEmployee(all 172 days)", () => earningsByEmployee(db, allIds));
  await time("analytics earningsByEmployee(month)", () => earningsByEmployee(db, monthIds));

  // --- Daily breakdown ---
  console.log("\n─── dailyRevenueBreakdown ───────────────────────────");
  await time("analytics dailyRevenueBreakdown(all 172 days)", () =>
    dailyRevenueBreakdown(db, allIds),
  );
  await time("analytics dailyRevenueBreakdown(month)", () => dailyRevenueBreakdown(db, monthIds));

  // --- Per-employee drill-down ---
  const empRows = await db
    .select({ id: employees.id, role: employees.role })
    .from(employees)
    .where(eq(employees.role, "stylist"))
    .limit(1);

  if (empRows[0]) {
    console.log("\n─── employeeDayBreakdown ────────────────────────────");
    await time("analytics employeeDayBreakdown(stylist, all 172 days)", () =>
      employeeDayBreakdown(db, empRows[0].id, allIds),
    );
    await time("analytics employeeDayBreakdown(stylist, month)", () =>
      employeeDayBreakdown(db, empRows[0].id, monthIds),
    );
  }

  // --- Warm vs cold (repeat to see cache effect) ---
  console.log("\n─── Warm repeat (Neon cache / connection reuse) ────");
  await time("analytics revenueByPeriod(all) — warm", () => revenueByPeriod(db, allIds));
  await time("analytics earningsByEmployee(all) — warm", () => earningsByEmployee(db, allIds));

  console.log("\n✅ Benchmark complete.\n");
  console.log("Note: Neon HTTP driver has ~20-50ms network round-trip overhead.");
  console.log("      Vercel Edge / ISR will see similar latency.");
  console.log(
    "      LCP, SSE, and navigation targets require browser measurement (see T107 AC).\n",
  );
}

run().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
