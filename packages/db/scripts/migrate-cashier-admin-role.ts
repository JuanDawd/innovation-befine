/**
 * One-time migration: update users with role = 'cashier_admin' to role = 'admin'.
 *
 * Run with:
 *   npx tsx packages/db/scripts/migrate-cashier-admin-role.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users } from "../src/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Find all users with the old cashier_admin role
  const affected = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "cashier_admin" as unknown as "admin"));

  if (affected.length === 0) {
    console.log("✅ No users with role = cashier_admin found. Nothing to migrate.");
    return;
  }

  console.log(`Found ${affected.length} user(s) with role = cashier_admin:`);
  for (const u of affected) {
    console.log(`  - ${u.name} (${u.email})`);
  }

  // Update role from cashier_admin → admin
  await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.role, "cashier_admin" as unknown as "admin"));

  console.log(`✅ Migrated ${affected.length} user(s) from cashier_admin → admin.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
