/**
 * M-71 — deterministic catalog for E2E (run after seed.ts).
 *
 * One service with a known price and commission so checkout and payroll specs
 * can assert exact peso amounts:
 *   "E2E Corte" / "Estándar" — $50.000, 40 % commission → stylist earns $20.000
 *
 * Refuses to run unless NEON_LOCAL_PROXY=1: it is only for the throwaway
 * database from scripts/test-db.sh, never a Neon branch.
 *
 * Run with: NEON_LOCAL_PROXY=1 DATABASE_URL=… node --import tsx/esm src/seed-e2e.ts
 */

import { and, eq } from "drizzle-orm";
import { createDb } from "./index";
import { services, serviceVariants } from "./schema";

export const E2E_SERVICE = {
  name: "E2E Corte",
  variant: "Estándar",
  price: 50_000,
  commissionPct: "40.00",
} as const;

async function seedE2e() {
  if (process.env.NEON_LOCAL_PROXY !== "1") {
    console.error("Refusing to seed: NEON_LOCAL_PROXY=1 is required (E2E database only).");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = createDb(databaseUrl);

  let [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.name, E2E_SERVICE.name));
  if (!service) {
    [service] = await db
      .insert(services)
      .values({ name: E2E_SERVICE.name })
      .returning({ id: services.id });
  }

  const [variant] = await db
    .select({ id: serviceVariants.id })
    .from(serviceVariants)
    .where(
      and(
        eq(serviceVariants.serviceId, service!.id),
        eq(serviceVariants.name, E2E_SERVICE.variant),
      ),
    );
  if (!variant) {
    await db.insert(serviceVariants).values({
      serviceId: service!.id,
      name: E2E_SERVICE.variant,
      customerPrice: E2E_SERVICE.price,
      commissionPct: E2E_SERVICE.commissionPct,
    });
  }

  console.log(`E2E catalog ready: ${E2E_SERVICE.name} / ${E2E_SERVICE.variant}`);
}

seedE2e().catch((err) => {
  console.error(err);
  process.exit(1);
});
